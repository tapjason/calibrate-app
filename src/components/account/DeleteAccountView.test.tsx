import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { DeleteAccountView } from './DeleteAccountView';

const deleteAccount = jest.fn();
const eraseDeviceData = jest.fn();

function seed({
  signedIn = true,
  provider = 'email',
  entitlement = FREE_ENTITLEMENT,
}: { signedIn?: boolean; provider?: string | null; entitlement?: Entitlement } = {}) {
  useAuthStore.setState({
    userId: signedIn ? 'user-1' : 'local-user-v1',
    status: signedIn ? 'authenticated' : 'guest',
    provider: signedIn ? provider : null,
    pending: false,
    deleteAccount,
    eraseDeviceData,
  });
  useEntitlementStore.setState({
    entitlement,
    isPlus: entitlement.is_plus,
    hydrated: true,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('DeleteAccountView — signed in', () => {
  it('deletes on one deliberate tap and confirms it happened', async () => {
    seed();
    deleteAccount.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<DeleteAccountView onDone={onDone} onCancel={jest.fn()} />);

    expect(screen.getByText('Delete your account?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    // Apple: "provide a confirmation when the deletion has been completed".
    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-done'));
    expect(onDone).toHaveBeenCalled();
  });

  // Once deleted, status flips to guest; the confirmation must not switch to
  // the guest wording mid-screen.
  it('keeps the account wording after the store has moved to guest', async () => {
    seed();
    deleteAccount.mockImplementation(async () => {
      useAuthStore.setState({ status: 'guest', userId: 'local-user-v1', provider: null });
      return { ok: true };
    });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
  });

  it('shows the failure and stays on the confirm step', async () => {
    seed();
    deleteAccount.mockResolvedValue({ ok: false, error: 'Nothing has been deleted.' });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(await screen.findByTestId('delete-error')).toHaveTextContent(
      'Nothing has been deleted.',
    );
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
  });

  // Apple: tell subscribers billing continues and ask them to cancel first.
  it.each(['trial', 'monthly', 'annual'] as const)(
    'warns a %s subscriber that billing continues, with a way to cancel',
    (source) => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      seed({ entitlement: { is_plus: true, source, expires_at: null } });
      render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

      expect(screen.getByTestId('delete-subscription-warning')).toBeTruthy();
      fireEvent.press(screen.getByTestId('delete-manage-subscription'));
      expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    },
  );

  it('gives a lifetime owner no billing warning — nothing renews', () => {
    seed({ entitlement: { is_plus: true, source: 'lifetime', expires_at: null } });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-subscription-warning')).toBeNull();
  });

  it('tells an Apple account it will be asked to confirm with Apple', () => {
    seed({ provider: 'apple' });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-apple-note')).toBeTruthy();
  });

  it('disables both buttons while deleting', () => {
    seed();
    useAuthStore.setState({ pending: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-cancel')).toBeDisabled();
  });
});

describe('DeleteAccountView — guest', () => {
  it('erases the device instead, and never calls account deletion', async () => {
    seed({ signedIn: false });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText('Erase all data on this phone?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    await waitFor(() => expect(eraseDeviceData).toHaveBeenCalled());
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });
});

// The account actions on authStore: sign in, sign up, Apple, sign out. The
// session side effects (guest handoff, reload, sync) are covered in
// authStore.test.ts through onAuthStateChange; these only check that the
// actions pass the service's outcome through and hold `pending` while in
// flight.

jest.mock('@/supabase/auth', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInWithApple: jest.fn(),
  signOut: jest.fn(),
  signOutLocal: jest.fn(),
  reauthenticateWithApple: jest.fn(),
}));
jest.mock('@/supabase/account', () => ({ deleteAccountOnServer: jest.fn() }));
jest.mock('@/db/account', () => ({ wipeLocalUserData: jest.fn() }));

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';

import { useAuthStore } from './authStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

const mocked = auth as jest.Mocked<typeof auth>;
const server = serverAccount as jest.Mocked<typeof serverAccount>;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('authStore account actions', () => {
  it('passes the email sign-in outcome through, error included', async () => {
    mocked.signInWithEmail.mockResolvedValue({ ok: false, error: 'Invalid login credentials' });

    await expect(
      useAuthStore.getState().signInWithEmail('a@b.co', 'hunter22'),
    ).resolves.toEqual({ ok: false, error: 'Invalid login credentials' });
    expect(mocked.signInWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter22');
  });

  it('reports a sign-up that still needs email confirmation', async () => {
    mocked.signUpWithEmail.mockResolvedValue({ ok: true, needsConfirmation: true });

    await expect(
      useAuthStore.getState().signUpWithEmail('a@b.co', 'hunter22'),
    ).resolves.toEqual({ ok: true, needsConfirmation: true });
  });

  it('holds pending while an action is in flight, and releases it after', async () => {
    let finish: (v: { ok: true }) => void = () => {};
    mocked.signInWithApple.mockReturnValue(new Promise((r) => (finish = r)));

    const call = useAuthStore.getState().signInWithApple();
    expect(useAuthStore.getState().pending).toBe(true);

    finish({ ok: true });
    await call;
    expect(useAuthStore.getState().pending).toBe(false);
  });

  it('releases pending even when the service throws', async () => {
    mocked.signOut.mockRejectedValue(new Error('boom'));

    await expect(useAuthStore.getState().signOut()).rejects.toThrow('boom');
    expect(useAuthStore.getState().pending).toBe(false);
  });

  // With no Supabase config the app is guest-only; no screen should offer an
  // account it can't create.
  it('reports accounts unavailable on a build with no Supabase config', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().accountsAvailable).toBe(false);
  });
});

describe('authStore.deleteAccount', () => {
  const signedIn = (provider: string) =>
    useAuthStore.setState({
      userId: 'user-1',
      email: 'a@b.co',
      status: 'authenticated',
      provider,
    });

  beforeEach(() => {
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    wipe.mockResolvedValue(undefined);
  });

  it('deletes on the server, then wipes this device, then drops the session', async () => {
    signedIn('email');
    const order: string[] = [];
    server.deleteAccountOnServer.mockImplementation(async () => {
      order.push('server');
      return { ok: true };
    });
    wipe.mockImplementation(async () => {
      order.push('wipe');
    });
    mocked.signOutLocal.mockImplementation(async () => {
      order.push('signOut');
      return { ok: true };
    });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(order).toEqual(['server', 'wipe', 'signOut']);
    expect(wipe).toHaveBeenCalledWith('user-1');
    // Not an Apple account: no re-auth sheet.
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });

  // The one outcome that must not happen is a half-deleted account.
  it('touches nothing on this device when the server fails', async () => {
    signedIn('email');
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: 'nope' });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: false,
      error: 'nope',
    });
    expect(wipe).not.toHaveBeenCalled();
    expect(mocked.signOutLocal).not.toHaveBeenCalled();
  });

  it('re-authenticates an Apple account and forwards the code for revocation', async () => {
    signedIn('apple');
    mocked.reauthenticateWithApple.mockResolvedValue('c1.fresh');
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });

    await useAuthStore.getState().deleteAccount();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh');
  });

  // Declining the Apple sheet must not block deletion (Apple rejects apps that
  // make leaving unnecessarily difficult).
  it('still deletes an Apple account when re-auth is declined', async () => {
    signedIn('apple');
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });

  // Once the server has deleted the account, "try again" would be a lie.
  it('reports success even if the local wipe fails afterwards', async () => {
    signedIn('email');
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });
    wipe.mockRejectedValue(new Error('disk'));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.signOutLocal).toHaveBeenCalled();
  });

  it('refuses for a guest', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', provider: null });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toMatchObject({ ok: false });
    expect(server.deleteAccountOnServer).not.toHaveBeenCalled();
  });
});

describe('authStore.eraseDeviceData', () => {
  it("wipes the guest's rows and the Warmup, then reloads the empty stores", async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', provider: null });
    wipe.mockResolvedValue(undefined);
    const retake = jest.fn(async () => {});
    useWarmupStore.setState({ retake });
    const loadPending = jest.fn(async () => {});
    const loadResolved = jest.fn(async () => {});
    usePredictionStore.setState({ loadPending, loadResolved });
    const loadForUser = jest.fn(async () => {});
    useStatsStore.setState({ loadForUser });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(wipe).toHaveBeenCalledWith(LOCAL_GUEST_USER_ID);
    expect(retake).toHaveBeenCalled();
    expect(loadPending).toHaveBeenCalled();
    expect(loadForUser).toHaveBeenCalledWith(LOCAL_GUEST_USER_ID);
  });

  // A signed-in account's data also lives on the server; erasing only the
  // phone would look like deletion without being it.
  it('refuses for a signed-in account', async () => {
    useAuthStore.setState({ userId: 'user-1', status: 'authenticated', provider: 'email' });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(wipe).not.toHaveBeenCalled();
  });
});

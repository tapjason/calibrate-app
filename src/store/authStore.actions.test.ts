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
}));

import * as auth from '@/supabase/auth';

import { useAuthStore } from './authStore';

const mocked = auth as jest.Mocked<typeof auth>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().reset();
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

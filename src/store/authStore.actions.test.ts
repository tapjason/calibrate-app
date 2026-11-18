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
  // The real one: the deletion tests below read it off real session shapes.
  hasAppleIdentity: jest.requireActual('@/supabase/auth').hasAppleIdentity,
}));
jest.mock('@/supabase/account', () => ({ deleteAccountOnServer: jest.fn() }));
// A signed-in session starts a sync; none of these tests is about it.
jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
}));
jest.mock('@/db/account', () => ({ wipeLocalUserData: jest.fn() }));
jest.mock('@/notifications/scheduler', () => ({
  dismissDeliveredNotifications: jest.fn(async () => {}),
}));

import type { Session, SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import { setSupabaseClientForTests } from '@/supabase/client';

import { useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';
import { useSettingsStore } from './settingsStore';
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
  beforeEach(() => {
    (
      jest.requireMock('@/notifications/scheduler').dismissDeliveredNotifications as jest.Mock
    ).mockClear();
  });

  const signedIn = (hasAppleIdentity: boolean) =>
    useAuthStore.setState({
      userId: 'user-1',
      email: 'a@b.co',
      status: 'authenticated',
      hasAppleIdentity,
    });

  beforeEach(() => {
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    wipe.mockResolvedValue(undefined);
  });

  it('deletes on the server, then wipes this device, then drops the session', async () => {
    signedIn(false);
    const order: string[] = [];
    // The Warmup and practice go too (owner, 2026-11-09).
    useWarmupStore.setState({ retake: jest.fn(async () => { order.push('warmup'); }) });
    usePracticeStore.setState({ clear: jest.fn(async () => { order.push('practice'); }) });
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

    const { dismissDeliveredNotifications } = jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockClear();
    (dismissDeliveredNotifications as jest.Mock).mockImplementationOnce(async () => {
      order.push('dismiss');
    });
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    // Reminders already on the lock screen were about the account that's gone;
    // clearing them comes last, after the data and the session.
    expect(order).toEqual(['server', 'wipe', 'warmup', 'practice', 'signOut', 'dismiss']);
    expect(dismissDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(wipe).toHaveBeenCalledWith('user-1');
    // Not an Apple account: no re-auth sheet.
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });

  // The one outcome that must not happen is a half-deleted account.
  it('touches nothing on this device when the server fails', async () => {
    signedIn(false);
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: 'nope' });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: false,
      error: 'nope',
    });
    expect(wipe).not.toHaveBeenCalled();
    expect(mocked.signOutLocal).not.toHaveBeenCalled();
    expect(
      jest.requireMock('@/notifications/scheduler').dismissDeliveredNotifications,
    ).not.toHaveBeenCalled();
  });

  it('re-authenticates an account with an Apple identity and forwards the code for revocation', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue('c1.fresh');
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });

    await useAuthStore.getState().deleteAccount();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh');
  });

  // Declining the Apple sheet must not block deletion (Apple rejects apps that
  // make leaving unnecessarily difficult).
  it('still deletes an Apple account when re-auth is declined', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });

  // Once the server has deleted the account, "try again" would be a lie.
  it('reports success even if the local wipe fails afterwards', async () => {
    signedIn(false);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });
    wipe.mockRejectedValue(new Error('disk'));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.signOutLocal).toHaveBeenCalled();
  });

  it('refuses for a guest', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toMatchObject({ ok: false });
    expect(server.deleteAccountOnServer).not.toHaveBeenCalled();
  });

  // Code review, 2026-11-15: the wipe and the sign-out waited on the lock
  // screen, so a native call that never settled would have kept the data.
  it("finishes even if clearing the lock screen never settles, and when the wipe fails", async () => {
    signedIn(false);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });
    const { dismissDeliveredNotifications } = jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(wipe).toHaveBeenCalledWith('user-1');
    expect(mocked.signOutLocal).toHaveBeenCalled();
    expect(useAuthStore.getState().pending).toBe(false);

    // A failed wipe still clears the lock screen: it sits outside that try.
    (dismissDeliveredNotifications as jest.Mock).mockClear();
    signedIn(false);
    wipe.mockRejectedValue(new Error('disk'));
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(dismissDeliveredNotifications).toHaveBeenCalledTimes(1);
  });
});

// Policy audit, 2026-11-18: Supabase links a Sign in with Apple identity that
// shares a verified email into the account that already has it, and
// app_metadata.provider keeps naming the first way in. Deciding the Apple leg
// on `provider === 'apple'` skipped Apple's revocation for an email account
// linked to Apple (App Store Guideline 5.1.1(v)). These run the real chain:
// a session's user, the store's flag, then deletion.
describe('authStore.deleteAccount: the Apple leg follows the account identities', () => {
  const identity = (provider: string) => ({
    id: `${provider}-sub`,
    identity_id: `${provider}-identity`,
    user_id: 'user-1',
    provider,
    identity_data: {},
  });

  function sessionFor(user: { app_metadata: unknown; identities?: unknown }): Session {
    return {
      access_token: 't',
      refresh_token: 'r',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        email: 'a@b.co',
        aud: 'authenticated',
        created_at: '2026-11-01T00:00:00.000Z',
        user_metadata: {},
        ...user,
      },
    } as unknown as Session;
  }

  const EMAIL_LINKED_TO_APPLE = sessionFor({
    app_metadata: { provider: 'email', providers: ['email', 'apple'] },
    identities: [identity('email'), identity('apple')],
  });
  const APPLE_FIRST = sessionFor({
    app_metadata: { provider: 'apple', providers: ['apple'] },
    identities: [identity('apple')],
  });
  const EMAIL_ONLY = sessionFor({
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [identity('email')],
  });

  let emit: (event: string, session: Session | null) => void = () => {};

  /** Signs in the way the app does: Supabase reports a stored session. */
  async function signInWith(session: Session) {
    let listener: ((event: string, s: Session | null) => void) | null = null;
    emit = (event, s) => listener?.(event, s);
    setSupabaseClientForTests({
      auth: {
        getSession: async () => ({ data: { session } }),
        onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
          listener = cb;
          return { data: { subscription: { unsubscribe: () => (listener = null) } } };
        },
      },
    } as unknown as SupabaseClient);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe('authenticated');
  }

  beforeEach(() => {
    // The reload after sign-in, kept off the database.
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    usePredictionStore.setState({
      loadPending: jest.fn(async () => {}),
      loadResolved: jest.fn(async () => {}),
    });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    wipe.mockResolvedValue(undefined);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true });
    mocked.reauthenticateWithApple.mockResolvedValue('c1.fresh');
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    setSupabaseClientForTests(null);
  });

  it('asks Apple and revokes for an email account linked to Apple', async () => {
    await signInWith(EMAIL_LINKED_TO_APPLE);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh');
  });

  it('asks Apple and revokes for an account made with Apple, as before', async () => {
    await signInWith(APPLE_FIRST);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh');
  });

  it('never shows the Apple sheet to an email-only account', async () => {
    await signInWith(EMAIL_ONLY);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(false);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });

  // The link can be made on another phone; the next session event this phone
  // gets (a token refresh, a user update) carries it.
  it('picks up an Apple link from a later session event', async () => {
    await signInWith(EMAIL_ONLY);
    emit('TOKEN_REFRESHED', EMAIL_LINKED_TO_APPLE);
    await new Promise((r) => setImmediate(r));
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await useAuthStore.getState().deleteAccount();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh');
  });

  // Declining the sheet still deletes, for a linked account as for any other.
  it('still deletes a linked account when the Apple sheet is declined', async () => {
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    await signInWith(EMAIL_LINKED_TO_APPLE);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null);
  });
});

// The account still exists after a sign-out, so what it was reminded of stays.
describe('authStore.signOut', () => {
  it('leaves delivered reminders on the lock screen', async () => {
    useAuthStore.setState({ userId: 'user-1', status: 'authenticated', hasAppleIdentity: false });
    mocked.signOut.mockResolvedValue({ ok: true });
    const { dismissDeliveredNotifications } = jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockClear();

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(dismissDeliveredNotifications).not.toHaveBeenCalled();
  });
});

describe('authStore.eraseDeviceData', () => {
  it("wipes the guest's rows, the Warmup and practice, then reloads the empty stores", async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    const retake = jest.fn(async () => {});
    useWarmupStore.setState({ retake });
    const clearPractice = jest.fn(async () => {});
    usePracticeStore.setState({ clear: clearPractice });
    const loadPending = jest.fn(async () => {});
    const loadResolved = jest.fn(async () => {});
    usePredictionStore.setState({ loadPending, loadResolved });
    const loadForUser = jest.fn(async () => {});
    useStatsStore.setState({ loadForUser });
    const loadCategories = jest.fn(async () => {});
    useCategoryStore.setState({ load: loadCategories });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(wipe).toHaveBeenCalledWith(LOCAL_GUEST_USER_ID);
    expect(retake).toHaveBeenCalled();
    // Practice belongs to the device, like the Warmup (roadmap step 88).
    expect(clearPractice).toHaveBeenCalled();
    expect(loadPending).toHaveBeenCalled();
    expect(loadForUser).toHaveBeenCalledWith(LOCAL_GUEST_USER_ID);
    // The erased categories (roadmap D39) are read again too.
    expect(loadCategories).toHaveBeenCalled();
  });

  // Code review, 2026-11-14: any category can be left off now, so a choice
  // about the erased record could empty the next card.
  it('forgets which categories were left off the card', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    const setHidden = jest.fn(async () => {});
    useSettingsStore.setState({ cardHiddenCategories: ['work'], setCardHiddenCategories: setHidden });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(setHidden).toHaveBeenCalledWith([]);
  });

  // Code review of step 182: a reminder already on the lock screen stayed
  // after Erase, with the prediction's words when those are shown.
  it('clears reminders already delivered', async () => {
    const { dismissDeliveredNotifications } = jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockClear();
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
    const order: string[] = [];
    useStatsStore.setState({ loadForUser: jest.fn(async () => { order.push('reload'); }) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    // After the reload, which cancels the reminders still to come, and never
    // waited on: one that doesn't settle can't hold Erase (code review,
    // 2026-11-15).
    (dismissDeliveredNotifications as jest.Mock).mockImplementationOnce(() => {
      order.push('dismiss');
      return new Promise(() => {});
    });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(dismissDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['reload', 'dismiss']);
    expect(useAuthStore.getState().pending).toBe(false);
  });

  // A signed-in account's data also lives on the server; erasing only the
  // phone would look like deletion without being it.
  it('refuses for a signed-in account', async () => {
    useAuthStore.setState({ userId: 'user-1', status: 'authenticated', hasAppleIdentity: false });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(wipe).not.toHaveBeenCalled();
  });
});

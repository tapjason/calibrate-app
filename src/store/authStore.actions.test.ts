// The account actions on authStore: sign in, sign up, Apple, Google, sign out. The
// session side effects (guest handoff, reload, sync) are covered in
// authStore.test.ts through onAuthStateChange; these only check that the
// actions pass the service's outcome through and hold `pending` while in
// flight.

jest.mock('@/supabase/auth', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
  signOutLocal: jest.fn(),
  reauthenticateWithApple: jest.fn(),
  // Round 5: a sign-out the client is still running holds account actions
  // back, and a session written back after a sign-out here is discarded.
  signOutStillSettling: jest.fn(() => false),
  whenSignOutSettles: jest.fn(async () => {}),
  discardStoredSession: jest.fn(async () => {}),
  // The real ones: the deletion tests below read them off real session shapes.
  hasAppleIdentity: jest.requireActual('@/supabase/auth').hasAppleIdentity,
  hasGoogleIdentity: jest.requireActual('@/supabase/auth').hasGoogleIdentity,
}));
jest.mock('@/supabase/account', () => ({ deleteAccountOnServer: jest.fn() }));
// A signed-in session starts a sync; none of these tests is about it.
jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  clearSyncCursor: jest.fn(async () => {}),
  // Round 5: sign-out pushes once more, and a wipe stops the account's sync.
  pushNow: jest.fn(async () => 0),
  stopSyncFor: jest.fn(async () => {}),
  resumeSyncFor: jest.fn(),
  // Round 6 (N2): what sign-out reads again just before the wipe.
  unsyncedRows: jest.fn(async () => new Map()),
}));
jest.mock('@/db/account', () => ({ wipeLocalUserData: jest.fn() }));
// Round 5: sign-out counts what the server doesn't have yet.
jest.mock('@/db/predictions', () => ({
  ...jest.requireActual('@/db/predictions'),
  countUnsynced: jest.fn(async () => 0),
}));
// Round 6 (N1): sign-out also counts the categories only this phone has.
jest.mock('@/db/categories', () => ({
  ...jest.requireActual('@/db/categories'),
  countLocalOnlyCategories: jest.fn(async () => 0),
}));
jest.mock('@/notifications/scheduler', () => ({
  dismissDeliveredNotifications: jest.fn(async () => {}),
  dismissDeliveredReminderWords: jest.fn(async () => {}),
}));
// The cache sweeps after a wipe (security review, 2026-11-18).
jest.mock('@/export/file', () => ({ sweepExportFiles: jest.fn(async () => {}) }));
jest.mock('@/share/export', () => ({ sweepShareCaptures: jest.fn(async () => {}) }));
jest.mock('@/media/iconImage', () => ({ sweepIconImageFiles: jest.fn(async () => {}) }));

import type { Session, SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import { setSupabaseClientForTests } from '@/supabase/client';

import { SIGN_OUT_FAILED_AFTER_WIPE, useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useCoachStore } from './coachStore';
import { useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
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

  // Step 192: Google through the system sheet, held and passed through like
  // Apple's.
  it('passes the Google sign-in outcome through, holding pending until it lands', async () => {
    let finish: (v: { ok: false; error: string }) => void = () => {};
    mocked.signInWithGoogle.mockReturnValue(new Promise((r) => (finish = r)));

    const call = useAuthStore.getState().signInWithGoogle();
    expect(useAuthStore.getState().pending).toBe(true);
    expect(mocked.signInWithGoogle).toHaveBeenCalledTimes(1);

    finish({ ok: false, error: 'Sign-in cancelled.' });
    await expect(call).resolves.toEqual({ ok: false, error: 'Sign-in cancelled.' });
    expect(useAuthStore.getState().pending).toBe(false);

    mocked.signInWithGoogle.mockResolvedValue({ ok: true });
    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toEqual({ ok: true });
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
      return { ok: true, appleRevoked: false };
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
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    // Reminders already on the lock screen were about the account that's gone;
    // clearing them comes last, after the data and the session.
    expect(order).toEqual(['server', 'wipe', 'warmup', 'practice', 'signOut', 'dismiss']);
    expect(dismissDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(wipe).toHaveBeenCalledWith('user-1');
    // Not an Apple account: no re-auth sheet.
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
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
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: true });

    await useAuthStore.getState().deleteAccount();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  // Declining the Apple sheet must not block deletion (Apple rejects apps that
  // make leaving unnecessarily difficult).
  it('still deletes an Apple account when re-auth is declined', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    // Nothing was revoked, so the finished screen says where to remove it.
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: true });
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
  });

  // Once the server has deleted the account, "try again" would be a lie.
  it('reports success even if the local wipe fails afterwards', async () => {
    signedIn(false);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    wipe.mockRejectedValue(new Error('disk'));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
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
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    const { dismissDeliveredNotifications } = jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(wipe).toHaveBeenCalledWith('user-1');
    expect(mocked.signOutLocal).toHaveBeenCalled();
    expect(useAuthStore.getState().pending).toBe(false);

    // A failed wipe still clears the lock screen: it sits outside that try.
    (dismissDeliveredNotifications as jest.Mock).mockClear();
    signedIn(false);
    wipe.mockRejectedValue(new Error('disk'));
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(dismissDeliveredNotifications).toHaveBeenCalledTimes(1);
  });
});

// Security review, 2026-11-18, round 4 (ACCOUNT_SPEC §3.2 step 5): when an
// account with an Apple identity is deleted without its grant revoked, the
// finished screen says where to remove the app. Unsure reads as not revoked.
describe('authStore.deleteAccount: whether Sign in with Apple may still list the app', () => {
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
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
  });

  it('is false for an Apple account whose grant the server revoked', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue('c1.fresh');
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: true });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: true,
      appleNotRevoked: false,
    });
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  it('is true when the Apple sheet was cancelled, so no code was sent', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: true,
      appleNotRevoked: true,
    });
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
  });

  // A different Apple ID, a failed or timed-out leg, an unreadable answer, or
  // a deletion confirmed by the "already deleted" check: the client reports
  // each as not revoked (src/supabase/account.test.ts).
  it('is true when a code was sent but the server did not confirm the revoke', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue('c1.other-apple-id');
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: true,
      appleNotRevoked: true,
    });
  });

  it('is false for an account with no Apple identity, which is never asked', async () => {
    signedIn(false);
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: true,
      appleNotRevoked: false,
    });
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
  });

  it('carries nothing about Apple when the deletion failed', async () => {
    signedIn(true);
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: 'nope' });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: false,
      error: 'nope',
    });
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
  const GOOGLE_FIRST = sessionFor({
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [identity('google')],
  });
  const GOOGLE_LINKED_TO_APPLE = sessionFor({
    app_metadata: { provider: 'google', providers: ['google', 'apple'] },
    identities: [identity('google'), identity('apple')],
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
    // As the function answers: revoked when a code was sent, as here.
    server.deleteAccountOnServer.mockImplementation(async (code) => ({
      ok: true,
      appleRevoked: code !== null,
    }));
    mocked.reauthenticateWithApple.mockResolvedValue('c1.fresh');
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    setSupabaseClientForTests(null);
  });

  it('asks Apple and revokes for an email account linked to Apple', async () => {
    await signInWith(EMAIL_LINKED_TO_APPLE);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  it('asks Apple and revokes for an account made with Apple, as before', async () => {
    await signInWith(APPLE_FIRST);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  it('never shows the Apple sheet to an email-only account', async () => {
    await signInWith(EMAIL_ONLY);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(false);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
  });

  // The link can be made on another phone; the next session event this phone
  // gets (a token refresh, a user update) carries it.
  it('picks up an Apple link from a later session event', async () => {
    await signInWith(EMAIL_ONLY);
    emit('TOKEN_REFRESHED', EMAIL_LINKED_TO_APPLE);
    await new Promise((r) => setImmediate(r));
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await useAuthStore.getState().deleteAccount();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  // Step 192: a Google account is told where to remove the app from its
  // Google Account (DeleteAccountView); deletion itself asks no Google sheet
  // and sends no Google code, since the app holds no Google token.
  it('marks an account made with Google, and deletes it without any Apple or Google sheet', async () => {
    await signInWith(GOOGLE_FIRST);
    expect(useAuthStore.getState().hasGoogleIdentity).toBe(true);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(false);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(mocked.reauthenticateWithApple).not.toHaveBeenCalled();
    expect(mocked.signInWithGoogle).not.toHaveBeenCalled();
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
  });

  it('marks both for a Google account linked to Apple, and still revokes Apple', async () => {
    await signInWith(GOOGLE_LINKED_TO_APPLE);
    expect(useAuthStore.getState().hasGoogleIdentity).toBe(true);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(true);

    await useAuthStore.getState().deleteAccount();
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith('c1.fresh', { expectedUserId: 'user-1' });
  });

  it('clears the Google mark when the session goes', async () => {
    await signInWith(GOOGLE_FIRST);
    emit('SIGNED_OUT', null);
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().hasGoogleIdentity).toBe(false);
    expect(useAuthStore.getState().hasAppleIdentity).toBe(false);
  });

  it('marks no Google identity on an email-only account', async () => {
    await signInWith(EMAIL_ONLY);
    expect(useAuthStore.getState().hasGoogleIdentity).toBe(false);
  });

  // Declining the sheet still deletes, for a linked account as for any other.
  it('still deletes a linked account when the Apple sheet is declined', async () => {
    mocked.reauthenticateWithApple.mockResolvedValue(null);
    await signInWith(EMAIL_LINKED_TO_APPLE);

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: true });
    expect(mocked.reauthenticateWithApple).toHaveBeenCalledTimes(1);
    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
  });
});

// The account still exists after a sign-out, so what it was reminded of stays,
// except a reminder showing a prediction's words (security review,
// 2026-11-18): the person asked to leave, and the phone may change hands.
describe('authStore.signOut', () => {
  it('takes reminders showing words off the lock screen, and leaves the rest', async () => {
    useAuthStore.setState({ userId: 'user-1', status: 'authenticated', hasAppleIdentity: false });
    mocked.signOut.mockResolvedValue({ ok: true });
    const { dismissDeliveredNotifications, dismissDeliveredReminderWords } =
      jest.requireMock('@/notifications/scheduler');
    (dismissDeliveredNotifications as jest.Mock).mockClear();
    (dismissDeliveredReminderWords as jest.Mock).mockClear();

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(dismissDeliveredNotifications).not.toHaveBeenCalled();
    expect(dismissDeliveredReminderWords).toHaveBeenCalled();
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

// Step 194: the day a streak checkpoint's moment played was about the erased
// record, like the categories left off the card.
describe('the checkpoint moment after Erase and account deletion', () => {
  const PLAYED = 'Wed Nov 18 2026';

  it('is forgotten by Erase', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    useSettingsStore.setState({ streakMomentDay: PLAYED });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });

  it('is forgotten when the account is deleted', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    wipe.mockResolvedValue(undefined);
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    useSettingsStore.setState({ streakMomentDay: PLAYED });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });
});

// D69 (b): when the line about usage counts was first shown goes with the
// Warm-up that showed it. Erase and account deletion are a fresh start, so the
// line is shown again before a guest's counts go up; sign-out keeps the
// Warm-up, and the stamp with it.
describe('the usage line’s stamp after Erase, account deletion and sign-out', () => {
  const SHOWN = '2026-11-19T09:00:00.000Z';

  it('is forgotten by Erase', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    useSettingsStore.setState({ usageNoticeShownAt: SHOWN });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
  });

  it('is forgotten when the account is deleted', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    wipe.mockResolvedValue(undefined);
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    useSettingsStore.setState({ usageNoticeShownAt: SHOWN });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
  });

  it('is kept by sign-out, which keeps the Warm-up', async () => {
    useAuthStore.setState({ userId: 'user-1', status: 'authenticated', hasAppleIdentity: false });
    mocked.signOut.mockResolvedValue({ ok: true });
    useSettingsStore.setState({ usageNoticeShownAt: SHOWN });

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(SHOWN);
  });
});

// ----------------------------------------------------------------------------
// Security review, 2026-11-18
// ----------------------------------------------------------------------------

const scheduler = () =>
  jest.requireMock('@/notifications/scheduler') as {
    dismissDeliveredNotifications: jest.Mock;
    dismissDeliveredReminderWords: jest.Mock;
  };
const sweeps = () => [
  (jest.requireMock('@/export/file') as { sweepExportFiles: jest.Mock }).sweepExportFiles,
  (jest.requireMock('@/share/export') as { sweepShareCaptures: jest.Mock }).sweepShareCaptures,
  (jest.requireMock('@/media/iconImage') as { sweepIconImageFiles: jest.Mock }).sweepIconImageFiles,
];
const clearCursor = () =>
  (jest.requireMock('@/supabase/sync') as { clearSyncCursor: jest.Mock }).clearSyncCursor;

/** A Coach card on screen, as if the signed-in account had asked. */
function coachShowing(): void {
  useCoachStore.setState({
    insights: [{ kind: 'pattern', text: 'x', evidence: 1 } as never],
    lastAnsweredAt: '2026-11-18T10:00:00.000Z',
  });
}
const coachInsights = () => useCoachStore.getState().insights;

function sessionFor(userId: string): Session {
  return {
    access_token: 't',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      email: 'a@b.co',
      aud: 'authenticated',
      created_at: '2026-11-01T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
    },
  } as unknown as Session;
}

/** Signs in the way the app does, and returns a way to send session events. */
async function signedInAs(userId: string) {
  let listener: ((event: string, s: Session | null) => void) | null = null;
  setSupabaseClientForTests({
    auth: {
      getSession: async () => ({ data: { session: sessionFor(userId) } }),
      onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => (listener = null) } } };
      },
    },
  } as unknown as SupabaseClient);
  await useAuthStore.getState().initialize();
  expect(useAuthStore.getState().userId).toBe(userId);
  return async (event: string, session: Session | null) => {
    listener?.(event, session);
    await new Promise((r) => setImmediate(r));
  };
}

describe('authStore.signOut always ends the session on this phone', () => {
  let clearDraft: jest.Mock;
  let clearRun: jest.Mock;

  beforeEach(() => {
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    usePredictionStore.setState({
      loadPending: jest.fn(async () => {}),
      loadResolved: jest.fn(async () => {}),
    });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    clearDraft = jest.fn(async () => {});
    useLogDraftStore.setState({ clear: clearDraft });
    clearRun = jest.fn();
    useResolveRunStore.setState({ clear: clearRun });
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    setSupabaseClientForTests(null);
  });

  it.each([
    ['online', { ok: true } as const],
    ['offline, ended on this phone alone', { ok: true, localOnly: true } as const],
  ])('%s: the app becomes the guest and runs everything a sign-out runs', async (_label, result) => {
    await signedInAs('user-1');
    coachShowing();
    mocked.signOut.mockResolvedValue(result);
    scheduler().dismissDeliveredReminderWords.mockClear();

    await expect(useAuthStore.getState().signOut()).resolves.toEqual(result);
    expect(useAuthStore.getState()).toMatchObject({
      userId: LOCAL_GUEST_USER_ID,
      status: 'guest',
      email: null,
      pending: false,
    });
    // The account's half-typed draft and answer run, its Coach cards, and
    // reminders on the lock screen showing its words.
    expect(clearDraft).toHaveBeenCalled();
    expect(clearRun).toHaveBeenCalled();
    expect(coachInsights()).toEqual([]);
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
    expect(scheduler().dismissDeliveredNotifications).not.toHaveBeenCalled();
  });

  // Round 7 (L3): the account's rows go before the session ends (round 6),
  // so here the error says they went (`SIGN_OUT_FAILED_AFTER_WIPE`). Was: the
  // session's own error, "Couldn't sign you out on this phone. Try again.",
  // which a wipe that didn't go still returns (authStore.signOut.test.ts).
  it('when even this phone could not end it, stays signed in and says so', async () => {
    await signedInAs('user-1');
    mocked.signOut.mockResolvedValue({
      ok: false,
      error: "Couldn't sign you out on this phone. Try again.",
    });
    scheduler().dismissDeliveredReminderWords.mockClear();

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_FAILED_AFTER_WIPE,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(clearDraft).not.toHaveBeenCalled();
    // The words still leave the lock screen: the person asked to leave.
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
  });

  it("a session that ends without a tap (one that expired) also takes the words off the lock screen", async () => {
    const emit = await signedInAs('user-1');
    scheduler().dismissDeliveredReminderWords.mockClear();
    await emit('SIGNED_OUT', null);
    expect(useAuthStore.getState().status).toBe('guest');
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
  });
});

describe("the Coach's cards follow the signed-in account", () => {
  beforeEach(() => {
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    usePredictionStore.setState({
      loadPending: jest.fn(async () => {}),
      loadResolved: jest.fn(async () => {}),
    });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useLogDraftStore.setState({ clear: jest.fn(async () => {}) });
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    setSupabaseClientForTests(null);
  });

  it('go when another account signs in', async () => {
    const emit = await signedInAs('user-1');
    coachShowing();
    await emit('SIGNED_IN', sessionFor('user-2'));
    expect(useAuthStore.getState().userId).toBe('user-2');
    expect(coachInsights()).toEqual([]);
  });

  it('stay through a token refresh for the same account', async () => {
    const emit = await signedInAs('user-1');
    coachShowing();
    await emit('TOKEN_REFRESHED', sessionFor('user-1'));
    expect(coachInsights()).toHaveLength(1);
  });
});

describe('authStore.deleteAccount: what goes with the account', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    mocked.signOutLocal.mockResolvedValue({ ok: true });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    usePredictionStore.setState({
      loadPending: jest.fn(async () => {}),
      loadResolved: jest.fn(async () => {}),
    });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    clearCursor().mockClear();
    for (const sweep of sweeps()) sweep.mockClear();
  });

  it("clears the account's sync cursor, the cached copies and the Coach, and becomes the guest", async () => {
    coachShowing();
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(clearCursor()).toHaveBeenCalledWith('user-1');
    for (const sweep of sweeps()) expect(sweep).toHaveBeenCalledTimes(1);
    expect(coachInsights()).toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
  });

  it('still clears them when the wipe fails', async () => {
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    wipe.mockRejectedValue(new Error('disk'));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(clearCursor()).toHaveBeenCalledWith('user-1');
    for (const sweep of sweeps()) expect(sweep).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the server's own failure", "Couldn't delete your account right now. Nothing has been deleted. Try again in a moment."],
    ['no answer either way', "Couldn't confirm whether your account was deleted. Check your connection and try again."],
  ])('on %s, touches nothing on this phone', async (_label, error) => {
    coachShowing();
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: false, error });
    expect(wipe).not.toHaveBeenCalled();
    expect(clearCursor()).not.toHaveBeenCalled();
    for (const sweep of sweeps()) expect(sweep).not.toHaveBeenCalled();
    expect(mocked.signOutLocal).not.toHaveBeenCalled();
    expect(coachInsights()).toHaveLength(1);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
  });

  it('stays signed in on this phone only when even the local sign-out failed', async () => {
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    mocked.signOutLocal.mockResolvedValue({ ok: false, error: "Couldn't sign you out on this phone. Try again." });

    // The account is gone and the phone wiped: still a success.
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(wipe).toHaveBeenCalledWith('user-1');
  });
});

describe('authStore.eraseDeviceData: the cached copies and the Coach', () => {
  it('sweeps the cache and drops the Coach', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipe.mockResolvedValue(undefined);
    useWarmupStore.setState({ retake: jest.fn(async () => {}) });
    usePracticeStore.setState({ clear: jest.fn(async () => {}) });
    usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
    useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
    useCategoryStore.setState({ load: jest.fn(async () => {}) });
    for (const sweep of sweeps()) sweep.mockClear();
    coachShowing();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    for (const sweep of sweeps()) expect(sweep).toHaveBeenCalledTimes(1);
    expect(coachInsights()).toEqual([]);
  });
});

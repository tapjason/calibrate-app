// Sign-out takes the account's rows off the phone (owner decision 2026-11-19,
// D69 (a); security review round 5), and a session that ends by itself after
// an unconfirmed deletion takes them too. The services are mocked; the store
// runs for real.

jest.mock('@/supabase/auth', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
  signOutLocal: jest.fn(),
  reauthenticateWithApple: jest.fn(),
  signOutStillSettling: jest.fn(() => false),
  whenSignOutSettles: jest.fn(async () => {}),
  discardStoredSession: jest.fn(async () => {}),
  hasAppleIdentity: jest.requireActual('@/supabase/auth').hasAppleIdentity,
  hasGoogleIdentity: jest.requireActual('@/supabase/auth').hasGoogleIdentity,
}));
jest.mock('@/supabase/account', () => ({
  ...jest.requireActual('@/supabase/account'),
  deleteAccountOnServer: jest.fn(),
}));
jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  clearSyncCursor: jest.fn(async () => {}),
  pushNow: jest.fn(async () => 0),
  stopSyncFor: jest.fn(async () => {}),
  resumeSyncFor: jest.fn(),
  // Round 6 (N2): what sign-out reads again just before the wipe.
  unsyncedRows: jest.fn(async () => new Map()),
}));
jest.mock('@/db/account', () => ({
  wipeLocalUserData: jest.fn(async () => {}),
  wipeEverythingOnDevice: jest.fn(async () => []),
}));
jest.mock('@/db/predictions', () => ({
  ...jest.requireActual('@/db/predictions'),
  countUnsynced: jest.fn(async () => 0),
}));
// Round 6 (N1): sign-out also counts the categories only this phone has.
jest.mock('@/db/categories', () => ({
  ...jest.requireActual('@/db/categories'),
  countLocalOnlyCategories: jest.fn(async () => 0),
}));
jest.mock('@/db/migrateGuestData', () => ({
  ...jest.requireActual('@/db/migrateGuestData'),
  migrateGuestDataToUser: jest.fn(async () => ({ predictionsMoved: 0 })),
}));
jest.mock('@/notifications/scheduler', () => ({
  dismissDeliveredNotifications: jest.fn(async () => {}),
  dismissDeliveredReminderWords: jest.fn(async () => {}),
}));
jest.mock('@/export/file', () => ({ sweepExportFiles: jest.fn(async () => {}) }));
jest.mock('@/share/export', () => ({ sweepShareCaptures: jest.fn(async () => {}) }));
jest.mock('@/media/iconImage', () => ({ sweepIconImageFiles: jest.fn(async () => {}) }));

import type { Session, SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as predictionsDb from '@/db/predictions';
import {
  DELETE_FAILED_MESSAGE,
  DELETE_UNCONFIRMED_MESSAGE,
} from '@/supabase/account';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import {
  __resetAuthMarkersForTests,
  addOwedWipe,
  AUTH_MARKERS_KEY,
  deletionAskedAt,
  isSignedOutHere,
  owedWipeFor,
  type MarkerStorage,
} from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { SIGN_OUT_CHECK_FAILED, SIGN_OUT_FAILED_AFTER_WIPE, useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useCoachStore } from './coachStore';
import { useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { useSettingsStore } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

const mockedAuth = auth as jest.Mocked<typeof auth>;
const server = serverAccount as jest.Mocked<typeof serverAccount>;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;
const countUnsynced = (predictionsDb as jest.Mocked<typeof predictionsDb>).countUnsynced;
const sync = () =>
  jest.requireMock('@/supabase/sync') as {
    syncNow: jest.Mock;
    clearSyncCursor: jest.Mock;
    pushNow: jest.Mock;
    stopSyncFor: jest.Mock;
    resumeSyncFor: jest.Mock;
  };
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

class MemoryStorage implements MarkerStorage {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

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

let markerStorage: MemoryStorage;
let clearDraft: jest.Mock;
let clearRun: jest.Mock;
let retake: jest.Mock;
let clearPractice: jest.Mock;

/** Starts the app with `stored` as the stored session; returns a way to send auth events. */
async function launch(stored: Session | null) {
  let listener: ((event: string, s: Session | null) => void) | null = null;
  setSupabaseClientForTests({
    auth: {
      getSession: async () => ({ data: { session: stored } }),
      onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => (listener = null) } } };
      },
    },
  } as unknown as SupabaseClient);
  await useAuthStore.getState().initialize();
  return async (event: string, session: Session | null) => {
    listener?.(event, session);
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  };
}

/** A new run of the app: memory gone, the stored markers kept. */
function restart(): void {
  useAuthStore.getState().reset();
  __resetAuthMarkersForTests(markerStorage);
}

function coachShowing(): void {
  useCoachStore.setState({
    insights: [{ kind: 'pattern', text: 'x', evidence: 1 } as never],
    lastAnsweredAt: '2026-11-18T10:00:00.000Z',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
  markerStorage = new MemoryStorage();
  __resetAuthMarkersForTests(markerStorage);
  countUnsynced.mockResolvedValue(0);
  wipe.mockResolvedValue(undefined);
  mockedAuth.signOut.mockResolvedValue({ ok: true });
  mockedAuth.signOutLocal.mockResolvedValue({ ok: true });
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {}),
    loadResolved: jest.fn(async () => {}),
  });
  useStatsStore.setState({ loadForUser: jest.fn(async () => {}), recomputeForUser: jest.fn(async () => {}) });
  clearDraft = jest.fn(async () => true);
  useLogDraftStore.setState({ clear: clearDraft });
  clearRun = jest.fn();
  useResolveRunStore.setState({ clear: clearRun });
  retake = jest.fn(async () => {});
  useWarmupStore.setState({ retake });
  clearPractice = jest.fn(async () => {});
  usePracticeStore.setState({ clear: clearPractice });
});

afterEach(() => {
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  jest.restoreAllMocks();
});

describe('sign-out with changes the server does not have yet', () => {
  it('pushes once more, then asks first: nothing changes', async () => {
    await launch(sessionFor('user-1'));
    coachShowing();
    countUnsynced.mockResolvedValue(3);

    // Round 6 (N1): the question also says how many categories only this phone has.
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      unsynced: 3,
      localCategories: 0,
    });

    expect(sync().pushNow).toHaveBeenCalledWith('user-1');
    expect(countUnsynced).toHaveBeenCalledWith('user-1');
    // Still signed in, every row here, nothing on its way out.
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(sync().stopSyncFor).not.toHaveBeenCalled();
    expect(sync().clearSyncCursor).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-1',
      status: 'authenticated',
      pending: false,
    });
    expect(clearDraft).not.toHaveBeenCalled();
    expect(useCoachStore.getState().insights).toHaveLength(1);
    expect(scheduler().dismissDeliveredReminderWords).not.toHaveBeenCalled();
    for (const sweep of sweeps()) expect(sweep).not.toHaveBeenCalled();
  });

  // Round 7 (L1): the question comes first, as on the screen; a confirmed
  // discard with none asked agrees to nothing (tested below). Was: the
  // confirmed call alone, with no question before it.
  it('signs out and takes the rows when the person says to discard them', async () => {
    await launch(sessionFor('user-1'));
    countUnsynced.mockResolvedValue(3);

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      unsynced: 3,
      localCategories: 0,
    });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    // One more push even so: what can still reach the server does.
    expect(sync().pushNow).toHaveBeenCalledWith('user-1');
    // Round 6 (N1): this phone's integrity counts stay.
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
  });

  it("says so, and changes nothing, when what's unsynced can't be counted", async () => {
    await launch(sessionFor('user-1'));
    countUnsynced.mockRejectedValue(new Error('disk'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_CHECK_FAILED,
    });
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(SIGN_OUT_CHECK_FAILED).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });
});

describe('sign-out with everything backed up', () => {
  it.each([
    ['online', { ok: true } as const],
    ['on this phone alone', { ok: true, localOnly: true } as const],
  ])('%s: the session ends, then the account’s rows leave the phone, then the guest', async (_label, result) => {
    await launch(sessionFor('user-1'));
    coachShowing();
    const order: string[] = [];
    sync().pushNow.mockImplementationOnce(async () => {
      order.push('push');
      return 0;
    });
    countUnsynced.mockImplementationOnce(async () => {
      order.push('count');
      return 0;
    });
    sync().stopSyncFor.mockImplementationOnce(async () => {
      order.push('stopSync');
    });
    mockedAuth.signOut.mockImplementationOnce(async () => {
      order.push('endSession');
      return result;
    });
    wipe.mockImplementationOnce(async () => {
      order.push('wipe');
    });
    sync().clearSyncCursor.mockImplementationOnce(async () => {
      order.push('cursor');
    });
    clearDraft.mockImplementationOnce(async () => {
      order.push('draft');
    });

    await expect(useAuthStore.getState().signOut()).resolves.toEqual(result);

    // Round 6 (N2): the rows go before the session ends, so the recount just
    // before the wipe is made while the account can still be kept. Was:
    // 'endSession' before 'wipe' and 'cursor'.
    expect(order).toEqual(['push', 'count', 'stopSync', 'wipe', 'cursor', 'endSession', 'draft']);
    // The account's rows only: the Warm-up, the age band and this phone's
    // integrity counts stay (round 6, N1).
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(retake).not.toHaveBeenCalled();
    expect(clearPractice).not.toHaveBeenCalled();
    expect(sync().clearSyncCursor).toHaveBeenCalledWith('user-1');
    for (const sweep of sweeps()) expect(sweep).toHaveBeenCalledTimes(1);
    // Everything sign-out did before.
    expect(useAuthStore.getState()).toMatchObject({
      userId: LOCAL_GUEST_USER_ID,
      status: 'guest',
      email: null,
      pending: false,
    });
    expect(clearRun).toHaveBeenCalled();
    expect(useCoachStore.getState().insights).toEqual([]);
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
    expect(scheduler().dismissDeliveredNotifications).not.toHaveBeenCalled();
    // Nothing left owed.
    expect(owedWipeFor('user-1')).toBeNull();
    // Round 6 (N3): remembered on every sign-out, online too (was: only when
    // this phone ended the session alone).
    expect(isSignedOutHere('user-1')).toBe(true);
  });

  it("keeps the card's settings, which are the phone's", async () => {
    await launch(sessionFor('user-1'));
    const setHidden = jest.fn(async () => {});
    useSettingsStore.setState({ setCardHiddenCategories: setHidden });
    await useAuthStore.getState().signOut();
    expect(setHidden).not.toHaveBeenCalled();
  });

  // Round 6 (N2): the rows now go just before the session ends, so when even
  // this phone can't end it they have gone already: only what reached the
  // server, or what the person agreed to lose, and the first comes back with
  // the sync that starts at once (the cursor was cleared). Was: 'nothing
  // wiped', expect(wipe).not.toHaveBeenCalled().
  it('when even this phone could not end it: still signed in, its sync back on, and the wiped rows pulled again', async () => {
    await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockResolvedValue({ ok: false, error: auth.SIGN_OUT_FAILED ?? 'x' });
    sync().syncNow.mockClear();

    const outcome = await useAuthStore.getState().signOut();
    expect(outcome.ok).toBe(false);
    // Round 7 (L3): the error says the rows went, not that nothing changed.
    expect(outcome).toEqual({ ok: false, error: SIGN_OUT_FAILED_AFTER_WIPE });
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(sync().clearSyncCursor).toHaveBeenCalledWith('user-1');
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(sync().syncNow).toHaveBeenCalledWith('user-1', expect.anything());
    expect(usePredictionStore.getState().loadPending).toHaveBeenCalled();
    // Its sessions count again: not remembered as signed out here.
    expect(isSignedOutHere('user-1')).toBe(false);
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    // The words still leave the lock screen.
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
  });

  it('when ending the session throws: the error passes through, and the account is kept as it was', async () => {
    await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockRejectedValue(new Error('boom'));
    await expect(useAuthStore.getState().signOut()).rejects.toThrow('boom');
    // Round 6 (N2): the wipe ran first (was: not called); what reached the
    // server comes back with the sync that resumes.
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(isSignedOutHere('user-1')).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState().pending).toBe(false);
  });

  it('a wipe that fails still signs out, and is done at the next launch', async () => {
    await launch(sessionFor('user-1'));
    wipe.mockRejectedValueOnce(new Error('disk'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(useAuthStore.getState().status).toBe('guest');
    expect(owedWipeFor('user-1')).toBe('signOut');

    // The next launch, signed out.
    restart();
    wipe.mockClear();
    await launch(null);
    // A sign-out's wipe, retried: the integrity counts stay (round 6, N1).
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a sign-out that never ended the session (the app closed first) leaves no wipe owed for the account still signed in', async () => {
    await launch(sessionFor('user-1'));
    await addOwedWipe('user-1', 'signOut');

    restart();
    const emit = await launch(sessionFor('user-1'));
    expect(useAuthStore.getState().userId).toBe('user-1');
    expect(owedWipeFor('user-1')).toBeNull();
    // Its session later ending by itself takes nothing.
    await emit('SIGNED_OUT', null);
    expect(wipe).not.toHaveBeenCalled();
  });

  it('for the guest it ends any session as before, with nothing to push or wipe', async () => {
    await launch(null);
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(sync().pushNow).not.toHaveBeenCalled();
    expect(countUnsynced).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
  });

  it('a SIGNED_OUT Supabase sends while it runs starts no second wipe', async () => {
    const emit = await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockImplementationOnce(async () => {
      // What auth-js does online: the stored session goes, and SIGNED_OUT.
      await emit('SIGNED_OUT', null);
      return { ok: true };
    });
    await useAuthStore.getState().signOut();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('guest');
  });
});

describe('a deletion asked for and not confirmed (client reviewer HIGH 2)', () => {
  beforeEach(() => {
    mockedAuth.reauthenticateWithApple.mockResolvedValue(null);
  });

  it('is marked before the call goes', async () => {
    await launch(sessionFor('user-1'));
    let markedDuringCall: string | null = null;
    server.deleteAccountOnServer.mockImplementation(async () => {
      markedDuringCall = owedWipeFor('user-1');
      return { ok: false, error: DELETE_UNCONFIRMED_MESSAGE };
    });
    await useAuthStore.getState().deleteAccount();
    expect(markedDuringCall).toBe('deletion');
    // Unconfirmed: the mark stays, and nothing is wiped yet.
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(wipe).not.toHaveBeenCalled();
  });

  it('a confirmed failure clears the mark: nothing was deleted', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: DELETE_FAILED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a confirmed failure keeps the mark an earlier unconfirmed attempt set', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValueOnce({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    server.deleteAccountOnServer.mockResolvedValueOnce({ ok: false, error: DELETE_FAILED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBe('deletion');
  });

  it('a confirmed deletion wipes and clears the mark', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: true,
      appleNotRevoked: false,
    });
    expect(wipe).toHaveBeenCalledWith('user-1');
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState().status).toBe('guest');
  });

  // The main session's decision (2026-11-19): this wipe, like sign-out's,
  // takes the account's rows only; the Warm-up and practice are the phone's.
  it("wipes the account's rows, and only those, when its session later ends by itself", async () => {
    const emit = await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    expect(wipe).not.toHaveBeenCalled();

    // The account was deleted after all: the next token refresh fails, and
    // Supabase drops the session.
    await emit('SIGNED_OUT', null);
    expect(useAuthStore.getState().status).toBe('guest');
    expect(sync().stopSyncFor).toHaveBeenCalledWith('user-1');
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
    expect(retake).not.toHaveBeenCalled();
    expect(clearPractice).not.toHaveBeenCalled();
    expect(sync().clearSyncCursor).toHaveBeenCalledWith('user-1');
    for (const sweep of sweeps()) expect(sweep).toHaveBeenCalledTimes(1);
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('at the next launch with no session for it, wipes before anything shows', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    await useAuthStore.getState().deleteAccount();

    restart();
    await launch(null);
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
    expect(retake).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('at the next launch still signed in to it, waits for the session to end', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    await useAuthStore.getState().deleteAccount();

    restart();
    const emit = await launch(sessionFor('user-1'));
    expect(wipe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().userId).toBe('user-1');
    await emit('SIGNED_OUT', null);
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
  });

  it('a session that ends by itself with no deletion asked for wipes nothing', async () => {
    const emit = await launch(sessionFor('user-1'));
    await emit('SIGNED_OUT', null);
    expect(useAuthStore.getState().status).toBe('guest');
    expect(wipe).not.toHaveBeenCalled();
  });

  it("a sign-out after an unconfirmed deletion takes the account's rows and settles the mark; the Warm-up stays", async () => {
    await launch(sessionFor('user-1'));
    await addOwedWipe('user-1', 'deletion');
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(wipe).toHaveBeenCalledTimes(1);
    // A sign-out's wipe: the integrity counts stay (round 6, N1).
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(retake).not.toHaveBeenCalled();
    expect(clearPractice).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a confirmed deletion still clears the Warm-up and practice, with the call it always made', async () => {
    await launch(sessionFor('user-1'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    await useAuthStore.getState().deleteAccount();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(wipe).toHaveBeenCalledWith('user-1');
    expect(retake).toHaveBeenCalled();
    expect(clearPractice).toHaveBeenCalled();
  });

  it("a session that ends by itself never wipes a different account's rows", async () => {
    const emit = await launch(sessionFor('user-2'));
    await addOwedWipe('user-1', 'deletion');
    await emit('SIGNED_OUT', null);
    expect(wipe).not.toHaveBeenCalledWith('user-2', expect.anything());
    expect(wipe).not.toHaveBeenCalledWith('user-2');
  });
});

// ----------------------------------------------------------------------------
// Round 6 (client re-review N1-N4, 2026-11-19)
// ----------------------------------------------------------------------------

const countLocalCategories = () =>
  (jest.requireMock('@/db/categories') as { countLocalOnlyCategories: jest.Mock })
    .countLocalOnlyCategories;
const unsyncedRows = () =>
  (jest.requireMock('@/supabase/sync') as { unsyncedRows: jest.Mock }).unsyncedRows;

/** What the phone holds unsynced from now on: these dirty rows (id → updated_at), counted. */
function unsyncedNow(rows: Record<string, string>, extraCount = 0): void {
  unsyncedRows().mockResolvedValue(new Map(Object.entries(rows)));
  countUnsynced.mockResolvedValue(Object.keys(rows).length + extraCount);
}

describe('N1: categories only this phone has', () => {
  beforeEach(() => {
    countLocalCategories().mockResolvedValue(0);
    unsyncedRows().mockResolvedValue(new Map());
  });

  it('are asked about even with nothing unsynced, and nothing changes', async () => {
    await launch(sessionFor('user-1'));
    countLocalCategories().mockResolvedValue(2);

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      unsynced: 0,
      localCategories: 2,
    });
    expect(countLocalCategories()).toHaveBeenCalledWith('user-1');
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(sync().stopSyncFor).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState().status).toBe('authenticated');

    // Agreed: they go with the account's rows; the integrity counts stay.
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
  });

  it("can't be counted: says so, and nothing changes", async () => {
    await launch(sessionFor('user-1'));
    countLocalCategories().mockRejectedValue(new Error('disk'));
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_CHECK_FAILED,
    });
    expect(wipe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it("only sign-out keeps this phone's integrity counts: an unconfirmed deletion's wipe and a confirmed one take them", async () => {
    const emit = await launch(sessionFor('user-1'));
    mockedAuth.reauthenticateWithApple.mockResolvedValue(null);
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    await emit('SIGNED_OUT', null);
    expect(wipe).toHaveBeenLastCalledWith('user-1', { deviceData: false });

    restart();
    wipe.mockClear();
    await launch(sessionFor('user-2'));
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    await useAuthStore.getState().deleteAccount();
    expect(wipe).toHaveBeenCalledWith('user-2');
  });
});

describe('N2: a change made while sign-out runs is never wiped unasked', () => {
  beforeEach(() => {
    countLocalCategories().mockResolvedValue(0);
    unsyncedNow({});
  });

  it('one made while the question is open is asked about again, and nothing changes', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    await expect(useAuthStore.getState().signOut()).resolves.toMatchObject({ unsynced: 1 });

    // A reminder's Happened lands while the alert is up.
    unsyncedNow({ a: 't1', b: 't2' });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      unsynced: 2,
      localCategories: 0,
    });
    expect(sync().stopSyncFor).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();

    // Asked again and agreed: now it goes.
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('the same count with a different change is asked about again (one reached the server, another was made)', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    await useAuthStore.getState().signOut();
    unsyncedNow({ b: 't2' });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      unsynced: 1,
      localCategories: 0,
    });
    expect(wipe).not.toHaveBeenCalled();
  });

  it('an edit to a change already counted is asked about again', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    await useAuthStore.getState().signOut();
    unsyncedNow({ a: 't9' });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toMatchObject({
      ok: false,
      unsynced: 1,
    });
    expect(wipe).not.toHaveBeenCalled();
  });

  it('a change that reached the server meanwhile needs no new question', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1', b: 't2' });
    await useAuthStore.getState().signOut();
    unsyncedNow({ a: 't1' });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
  });

  it('a category added while the question is open is asked about again', async () => {
    await launch(sessionFor('user-1'));
    countLocalCategories().mockResolvedValue(1);
    await useAuthStore.getState().signOut();
    countLocalCategories().mockResolvedValue(2);
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      unsynced: 0,
      localCategories: 2,
    });
    expect(wipe).not.toHaveBeenCalled();
  });

  it('one made after the sync stopped, just before the wipe, stops it there: the account is kept as it was', async () => {
    await launch(sessionFor('user-1'));
    const order: string[] = [];
    let stopped = false;
    sync().stopSyncFor.mockImplementationOnce(async () => {
      order.push('stopSync');
      // A log on another tab while "Signing out…" shows.
      stopped = true;
    });
    unsyncedRows().mockImplementation(async () => {
      order.push('read');
      return new Map(stopped ? [['late', 't3']] : []);
    });
    countUnsynced.mockImplementation(async () => (stopped ? 1 : 0));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      unsynced: 1,
      localCategories: 0,
    });
    // Read, stop, read again: then nothing more.
    expect(order).toEqual(['read', 'stopSync', 'read']);
    expect(wipe).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(sync().clearSyncCursor).not.toHaveBeenCalled();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(owedWipeFor('user-1')).toBeNull();
    expect(isSignedOutHere('user-1')).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-1',
      status: 'authenticated',
      pending: false,
    });

    // The person agrees to that one too: it goes.
    unsyncedNow({ late: 't3' });
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('a category added just before the wipe stops it too', async () => {
    await launch(sessionFor('user-1'));
    sync().stopSyncFor.mockImplementationOnce(async () => {
      countLocalCategories().mockResolvedValue(1);
    });
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      unsynced: 0,
      localCategories: 1,
    });
    expect(wipe).not.toHaveBeenCalled();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
  });

  it('when the check just before the wipe fails: says so, and the account is kept as it was', async () => {
    await launch(sessionFor('user-1'));
    sync().stopSyncFor.mockImplementationOnce(async () => {
      countUnsynced.mockRejectedValue(new Error('disk'));
    });
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_CHECK_FAILED,
    });
    expect(wipe).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  // Round 7 (L1): a confirmed discard with no question for the account now
  // agrees to nothing, so the old ending (more at stake after signing in
  // again, then `ok: true` because it "covers what is here now") no longer
  // tells a forgotten question from a remembered one: both would ask. Now
  // the same change is at stake after signing in again; a question still
  // remembered would cover it, and a forgotten one asks again.
  it('what the person agreed to lose is forgotten when the app leaves the account', async () => {
    const emit = await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    await useAuthStore.getState().signOut();
    // Signed out elsewhere, then signed in here as the same account again.
    await emit('SIGNED_OUT', null);
    mockedAuth.signInWithEmail.mockImplementationOnce(async () => {
      await emit('SIGNED_IN', sessionFor('user-1'));
      return { ok: true };
    });
    await useAuthStore.getState().signInWithEmail('a@b.co', 'pw');
    expect(useAuthStore.getState().userId).toBe('user-1');
    unsyncedNow({ a: 't1' });
    // No question asked for it in this sign-in: it agrees to nothing.
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      unsynced: 1,
      localCategories: 0,
    });
    expect(wipe).not.toHaveBeenCalled();
    // Asked in this sign-in and agreed: now it goes.
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  // Round 7, client re-review L1.
  it('a confirmed discard with no question asked for the account agrees to nothing: it asks first, and nothing changes', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    countLocalCategories().mockResolvedValue(1);

    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      unsynced: 1,
      localCategories: 1,
    });
    expect(sync().stopSyncFor).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });

    // That was the question: confirming it now signs out.
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('a confirmed discard with nothing at stake signs out without a question', async () => {
    await launch(sessionFor('user-1'));
    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });
});

describe('N3: remembered as signed out here on every sign-out', () => {
  beforeEach(() => {
    countLocalCategories().mockResolvedValue(0);
    unsyncedNow({});
  });

  it('online: a token refresh landing as the sign-out does is ignored, and taken off the phone', async () => {
    const emit = await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockImplementationOnce(async () => {
      await emit('SIGNED_OUT', null);
      await emit('TOKEN_REFRESHED', sessionFor('user-1'));
      return { ok: true };
    });
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(mockedAuth.discardStoredSession).toHaveBeenCalled();
    expect(isSignedOutHere('user-1')).toBe(true);
  });

  it('online: a copy of its session found at the next launch is discarded', async () => {
    await launch(sessionFor('user-1'));
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    restart();
    mockedAuth.discardStoredSession.mockClear();
    await launch(sessionFor('user-1'));
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(mockedAuth.discardStoredSession).toHaveBeenCalled();
  });

  it('a sign-in the person starts to that account counts again', async () => {
    const emit = await launch(sessionFor('user-1'));
    await useAuthStore.getState().signOut();
    mockedAuth.signInWithEmail.mockImplementationOnce(async () => {
      await emit('SIGNED_IN', sessionFor('user-1'));
      return { ok: true };
    });
    await useAuthStore.getState().signInWithEmail('a@b.co', 'pw');
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(isSignedOutHere('user-1')).toBe(false);
  });
});

describe('N4: an unconfirmed deletion, settled by a later definite "still exists"', () => {
  const T0 = 1_900_000_000_000;
  const MIN = 60_000;
  let now: jest.SpyInstance;

  beforeEach(() => {
    mockedAuth.reauthenticateWithApple.mockResolvedValue(null);
    now = jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  const unconfirmed = () =>
    server.deleteAccountOnServer.mockResolvedValueOnce({ ok: false, error: DELETE_UNCONFIRMED_MESSAGE });
  const stillExists = (at: number) =>
    server.deleteAccountOnServer.mockResolvedValueOnce({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
      stillExistsAt: at,
    });

  it('asked after the earlier request can no longer delete anything: the mark goes', async () => {
    await launch(sessionFor('user-1'));
    unconfirmed();
    await useAuthStore.getState().deleteAccount();
    expect(deletionAskedAt('user-1')).toBe(T0);

    now.mockReturnValue(T0 + 11 * MIN);
    stillExists(T0 + 11 * MIN + 500);
    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({
      ok: false,
      error: DELETE_FAILED_MESSAGE,
    });
    expect(owedWipeFor('user-1')).toBeNull();
    expect(wipe).not.toHaveBeenCalled();
  });

  it('asked while the earlier request may still run: the mark stays, with that request\'s time', async () => {
    await launch(sessionFor('user-1'));
    unconfirmed();
    await useAuthStore.getState().deleteAccount();

    now.mockReturnValue(T0 + 2 * MIN);
    stillExists(T0 + 2 * MIN);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(deletionAskedAt('user-1')).toBe(T0);

    // The time outlasts a restart.
    restart();
    await launch(sessionFor('user-1'));
    expect(deletionAskedAt('user-1')).toBe(T0);
    now.mockReturnValue(T0 + 11 * MIN);
    stillExists(T0 + 11 * MIN);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a failure with nothing asked of the server keeps the mark and its time', async () => {
    await launch(sessionFor('user-1'));
    unconfirmed();
    await useAuthStore.getState().deleteAccount();
    now.mockReturnValue(T0 + 30 * MIN);
    server.deleteAccountOnServer.mockResolvedValueOnce({ ok: false, error: DELETE_FAILED_MESSAGE });
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(deletionAskedAt('user-1')).toBe(T0);
  });

  it('another unconfirmed request moves the time on: the window runs from the latest', async () => {
    await launch(sessionFor('user-1'));
    unconfirmed();
    await useAuthStore.getState().deleteAccount();
    now.mockReturnValue(T0 + 5 * MIN);
    unconfirmed();
    await useAuthStore.getState().deleteAccount();
    expect(deletionAskedAt('user-1')).toBe(T0 + 5 * MIN);

    now.mockReturnValue(T0 + 11 * MIN);
    stillExists(T0 + 11 * MIN);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBe('deletion');

    now.mockReturnValue(T0 + 16 * MIN);
    stillExists(T0 + 16 * MIN);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a mark an older build left with no time is settled once a definite answer is that much later than this attempt', async () => {
    markerStorage.data.set(
      AUTH_MARKERS_KEY,
      JSON.stringify({ v: 1, owed: [{ userId: 'user-1', reason: 'deletion' }], signedOutHere: [] }),
    );
    await launch(sessionFor('user-1'));
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(deletionAskedAt('user-1')).toBeNull();

    stillExists(T0 + 1_000);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(deletionAskedAt('user-1')).toBe(T0);

    now.mockReturnValue(T0 + 11 * MIN);
    stillExists(T0 + 11 * MIN);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBeNull();
  });

  it('a request with no earlier mark still clears its own on a definite failure, as before', async () => {
    await launch(sessionFor('user-1'));
    stillExists(T0);
    await useAuthStore.getState().deleteAccount();
    expect(owedWipeFor('user-1')).toBeNull();
  });
});

describe('round 6: the wipe now comes before the session ends', () => {
  beforeEach(() => {
    countLocalCategories().mockResolvedValue(0);
    unsyncedNow({});
  });

  it('a sign-out whose session could not end keeps the mark of an earlier unconfirmed deletion', async () => {
    await launch(sessionFor('user-1'));
    await addOwedWipe('user-1', 'deletion');
    mockedAuth.signOut.mockResolvedValueOnce({ ok: false, error: 'x' });
    await useAuthStore.getState().signOut();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('a wipe that fails, then a session that could not end: the account is kept, nothing owed', async () => {
    await launch(sessionFor('user-1'));
    wipe.mockRejectedValueOnce(new Error('disk'));
    mockedAuth.signOut.mockResolvedValueOnce({ ok: false, error: 'x' });
    await useAuthStore.getState().signOut();
    expect(owedWipeFor('user-1')).toBeNull();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('round 7 (L3): a session that could not end after the wipe says what went', () => {
  beforeEach(() => {
    countLocalCategories().mockResolvedValue(0);
    unsyncedNow({});
  });

  it('after agreeing to lose a change: still signed in, the error says so, and what the server has is pulled again', async () => {
    await launch(sessionFor('user-1'));
    unsyncedNow({ a: 't1' });
    countLocalCategories().mockResolvedValue(1);
    await expect(useAuthStore.getState().signOut()).resolves.toMatchObject({ ok: false, unsynced: 1 });
    mockedAuth.signOut.mockResolvedValueOnce({ ok: false, error: 'x' });
    sync().syncNow.mockClear();

    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_FAILED_AFTER_WIPE,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(sync().syncNow).toHaveBeenCalledWith('user-1', expect.anything());
  });

  it('with nothing at stake, the same: the rows went, and come back', async () => {
    await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockResolvedValueOnce({ ok: false, error: 'x' });
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({
      ok: false,
      error: SIGN_OUT_FAILED_AFTER_WIPE,
    });
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it("when the wipe didn't go either: the session's own error, every row still here", async () => {
    await launch(sessionFor('user-1'));
    wipe.mockRejectedValueOnce(new Error('disk'));
    mockedAuth.signOut.mockResolvedValueOnce({ ok: false, error: 'x' });
    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: false, error: 'x' });
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('is plain text', () => {
    expect(SIGN_OUT_FAILED_AFTER_WIPE).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    expect(SIGN_OUT_FAILED_AFTER_WIPE).not.toMatch(/[‘’“”]/);
  });
});

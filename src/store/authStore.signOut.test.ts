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
}));
jest.mock('@/db/account', () => ({ wipeLocalUserData: jest.fn(async () => {}) }));
jest.mock('@/db/predictions', () => ({
  ...jest.requireActual('@/db/predictions'),
  countUnsynced: jest.fn(async () => 0),
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
  isSignedOutHere,
  owedWipeFor,
  type MarkerStorage,
} from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { SIGN_OUT_CHECK_FAILED, useAuthStore } from './authStore';
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
  clearDraft = jest.fn(async () => {});
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

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: false, unsynced: 3 });

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

  it('signs out and takes the rows when the person says to discard them', async () => {
    await launch(sessionFor('user-1'));
    countUnsynced.mockResolvedValue(3);

    await expect(useAuthStore.getState().signOut({ discardUnsynced: true })).resolves.toEqual({
      ok: true,
    });
    // One more push even so: what can still reach the server does.
    expect(sync().pushNow).toHaveBeenCalledWith('user-1');
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
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

    expect(order).toEqual(['push', 'count', 'stopSync', 'endSession', 'wipe', 'cursor', 'draft']);
    // The account's rows only: the Warm-up and the age band stay.
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
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
    expect(isSignedOutHere('user-1')).toBe('localOnly' in result);
  });

  it("keeps the card's settings, which are the phone's", async () => {
    await launch(sessionFor('user-1'));
    const setHidden = jest.fn(async () => {});
    useSettingsStore.setState({ setCardHiddenCategories: setHidden });
    await useAuthStore.getState().signOut();
    expect(setHidden).not.toHaveBeenCalled();
  });

  it('when even this phone could not end it: still signed in, nothing wiped, its sync back on', async () => {
    await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockResolvedValue({ ok: false, error: auth.SIGN_OUT_FAILED ?? 'x' });

    const outcome = await useAuthStore.getState().signOut();
    expect(outcome.ok).toBe(false);
    expect(wipe).not.toHaveBeenCalled();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
    expect(owedWipeFor('user-1')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    // The words still leave the lock screen.
    expect(scheduler().dismissDeliveredReminderWords).toHaveBeenCalled();
  });

  it('when ending the session throws: the error passes through, and the account is kept as it was', async () => {
    await launch(sessionFor('user-1'));
    mockedAuth.signOut.mockRejectedValue(new Error('boom'));
    await expect(useAuthStore.getState().signOut()).rejects.toThrow('boom');
    expect(wipe).not.toHaveBeenCalled();
    expect(sync().resumeSyncFor).toHaveBeenCalledWith('user-1');
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
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
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
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false });
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

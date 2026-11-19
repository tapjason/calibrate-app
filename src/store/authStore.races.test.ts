// The two auth-js races of security review round 5, reproduced with the real
// auth service (src/supabase/auth.ts) and a fake client that behaves as
// auth-js 2.106 does:
//
//   LOW-A: a token refresh holding the client's lock finishes after this
//   phone signed out alone, writes the session back and sends
//   TOKEN_REFRESHED. It used to read as a sign-in and move the guest's rows
//   into the account.
//   LOW-B: the sign-out the client was still running (queued behind that
//   refresh) runs later and reads whatever session is stored then: a sign-in
//   started meanwhile would be signed out at once, everywhere. `pending` now
//   stays up until it settles (at most 60 s), and a sign-in waits for it.

jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  clearSyncCursor: jest.fn(async () => {}),
  pushNow: jest.fn(async () => 0),
  stopSyncFor: jest.fn(async () => {}),
  resumeSyncFor: jest.fn(),
  // Round 6 (N2): what sign-out reads again just before the wipe.
  unsyncedRows: jest.fn(async () => new Map()),
}));
jest.mock('@/db/account', () => ({ wipeLocalUserData: jest.fn(async () => {}) }));
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
import * as guestData from '@/db/migrateGuestData';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { __resetLateSignOutForTests } from '@/supabase/auth';
import {
  __resetAuthMarkersForTests,
  isSignedOutHere,
  type MarkerStorage,
} from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { useStatsStore } from './statsStore';

const KEY = 'sb-test-auth-token';
const migrate = (guestData as jest.Mocked<typeof guestData>).migrateGuestDataToUser;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;
const syncNow = () => (jest.requireMock('@/supabase/sync') as { syncNow: jest.Mock }).syncNow;

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
    access_token: `t-${userId}`,
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: 2_000_000_000,
    token_type: 'bearer',
    user: {
      id: userId,
      email: `${userId}@example.com`,
      aud: 'authenticated',
      created_at: '2026-11-01T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
    },
  } as unknown as Session;
}

/**
 * auth-js as far as these races need it. The stored session lives in
 * `storage` under KEY, read on every getSession (persistSession on). Its
 * `signOut()` is queued behind a refresh holding the lock: it settles only
 * when the test calls `runQueuedSignOut`, and then, as auth-js does, signs out
 * whatever session is stored at that moment.
 */
function fakeAuthJs(stored: Session | null) {
  const storage = new Map<string, string>();
  if (stored) storage.set(KEY, JSON.stringify(stored));
  let listener: ((event: string, s: Session | null) => void) | null = null;
  const queued: Array<(v: { error: null }) => void> = [];
  const signedOutByQueuedCall: string[] = [];
  const emit = (event: string, s: Session | null) => listener?.(event, s);
  const auth = {
    storageKey: KEY,
    storage: {
      getItem: async (k: string) => storage.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: async (k: string) => {
        storage.delete(k);
      },
    },
    async getSession() {
      const raw = storage.get(KEY);
      return { data: { session: raw ? (JSON.parse(raw) as Session) : null }, error: null };
    },
    onAuthStateChange(cb: (event: string, s: Session | null) => void) {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => (listener = null) } } };
    },
    signOut: jest.fn(
      () =>
        new Promise<{ error: null }>((resolve) => {
          queued.push(resolve);
        }),
    ),
    signInWithPassword: jest.fn(async ({ email }: { email: string }) => {
      const s = sessionFor(email.split('@')[0]);
      storage.set(KEY, JSON.stringify(s));
      emit('SIGNED_IN', s);
      return { data: { session: s, user: s.user }, error: null };
    }),
  };
  return {
    client: { auth } as unknown as SupabaseClient,
    auth,
    storage,
    emit,
    /** A token refresh that held the lock lands: the session is written back, then TOKEN_REFRESHED. */
    lateRefresh(s: Session) {
      storage.set(KEY, JSON.stringify(s));
      emit('TOKEN_REFRESHED', s);
    },
    /** The queued sign-out runs: whatever session is stored now is signed out. */
    runQueuedSignOut() {
      const raw = storage.get(KEY);
      if (raw) {
        signedOutByQueuedCall.push((JSON.parse(raw) as Session).user.id);
        storage.delete(KEY);
        emit('SIGNED_OUT', null);
      }
      for (const resolve of queued.splice(0)) resolve({ error: null });
    },
    signedOutByQueuedCall,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await jest.advanceTimersByTimeAsync(0);
}

let markerStorage: MemoryStorage;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
  markerStorage = new MemoryStorage();
  __resetAuthMarkersForTests(markerStorage);
  __resetLateSignOutForTests();
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {}),
    loadResolved: jest.fn(async () => {}),
  });
  useStatsStore.setState({
    loadForUser: jest.fn(async () => {}),
    recomputeForUser: jest.fn(async () => {}),
  });
  useLogDraftStore.setState({ clear: jest.fn(async () => {}) });
  useResolveRunStore.setState({ clear: jest.fn() });
});

afterEach(() => {
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  __resetLateSignOutForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Signed in as user-1, then signed out with no connection: the client's own sign-out still queued. */
async function signedOutOffline() {
  const fake = fakeAuthJs(sessionFor('user-1'));
  setSupabaseClientForTests(fake.client);
  await useAuthStore.getState().initialize();
  expect(useAuthStore.getState().userId).toBe('user-1');

  const outcome = useAuthStore.getState().signOut();
  // The server gets 10 s; then this phone ends the session alone.
  await jest.advanceTimersByTimeAsync(10_000);
  await flush();
  await expect(outcome).resolves.toEqual({ ok: true, localOnly: true });
  expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
  expect(fake.storage.has(KEY)).toBe(false);
  // Round 6 (N1): this phone's integrity counts stay through a sign-out.
  expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
  return fake;
}

describe('LOW-A: a token refresh that lands after this phone signed out alone', () => {
  it('is ignored: the app stays the guest, no guest row moves, and the session leaves storage again', async () => {
    const fake = await signedOutOffline();
    expect(isSignedOutHere('user-1')).toBe(true);
    syncNow().mockClear();

    fake.lateRefresh(sessionFor('user-1'));
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(migrate).not.toHaveBeenCalled();
    expect(fake.storage.has(KEY)).toBe(false);
    expect(syncNow()).not.toHaveBeenCalledWith('user-1', expect.anything());
  });

  it.each(['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'])(
    'is ignored as %s too, when the person started no sign-in',
    async (event) => {
      const fake = await signedOutOffline();
      fake.storage.set(KEY, JSON.stringify(sessionFor('user-1')));
      fake.emit(event, sessionFor('user-1'));
      await flush();
      expect(useAuthStore.getState().status).toBe('guest');
      expect(migrate).not.toHaveBeenCalled();
      expect(fake.storage.has(KEY)).toBe(false);
    },
  );

  it('after a restart, a session written back for that account is discarded before the app reads it', async () => {
    const fake = await signedOutOffline();
    fake.lateRefresh(sessionFor('user-1'));
    // Killed before anything else ran: the session is stored again.
    fake.storage.set(KEY, JSON.stringify(sessionFor('user-1')));

    useAuthStore.getState().reset();
    __resetAuthMarkersForTests(markerStorage);
    const next = fakeAuthJs(sessionFor('user-1'));
    setSupabaseClientForTests(next.client);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(next.storage.has(KEY)).toBe(false);
  });

  it('when the person signs in to that account again, it counts, and the guest rows move into it', async () => {
    const fake = await signedOutOffline();
    fake.runQueuedSignOut();
    await flush();

    await expect(
      useAuthStore.getState().signInWithEmail('user-1@example.com', 'pw'),
    ).resolves.toEqual({ ok: true });
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(migrate).toHaveBeenCalledWith('user-1');
    expect(isSignedOutHere('user-1')).toBe(false);
  });

  it("an account session the person didn't start never takes the guest's rows", async () => {
    const fake = fakeAuthJs(null);
    setSupabaseClientForTests(fake.client);
    await useAuthStore.getState().initialize();
    fake.storage.set(KEY, JSON.stringify(sessionFor('user-3')));
    fake.emit('TOKEN_REFRESHED', sessionFor('user-3'));
    await flush();
    expect(migrate).not.toHaveBeenCalled();
  });
});

describe('LOW-B: the sign-out the client is still running', () => {
  it('keeps pending up until it settles, and a sign-in waits for it, so the new session is never the one it signs out', async () => {
    const fake = await signedOutOffline();
    // The outcome is back, but the client's sign-out is still queued.
    expect(useAuthStore.getState().pending).toBe(true);

    const signIn = useAuthStore.getState().signInWithEmail('user-2@example.com', 'pw');
    await flush();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pending).toBe(true);

    // The refresh holding the lock gives up, the queued sign-out runs and
    // finds nothing stored.
    fake.runQueuedSignOut();
    await flush();
    await expect(signIn).resolves.toEqual({ ok: true });
    await flush();

    expect(fake.signedOutByQueuedCall).toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-2', status: 'authenticated' });
    expect(fake.storage.has(KEY)).toBe(true);
    expect(useAuthStore.getState().pending).toBe(false);
  });

  it('holds for at most 60 s; a refresh for the old account landing later still never signs the phone into it', async () => {
    const fake = await signedOutOffline();
    expect(useAuthStore.getState().pending).toBe(true);
    await jest.advanceTimersByTimeAsync(59_000);
    expect(useAuthStore.getState().pending).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(useAuthStore.getState().pending).toBe(false);

    // The person signs in to another account; the old refresh lands after.
    await useAuthStore.getState().signInWithEmail('user-2@example.com', 'pw');
    await flush();
    expect(useAuthStore.getState().userId).toBe('user-2');
    fake.lateRefresh(sessionFor('user-1'));
    await flush();

    // Its write replaced user-2's stored session: the app leaves user-2 too,
    // and is signed in to no one, rather than to user-1.
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(fake.storage.has(KEY)).toBe(false);
    expect(migrate).toHaveBeenCalledTimes(1); // user-2's own sign-in only
  });
});

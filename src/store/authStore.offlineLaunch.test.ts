// A launch with no connection opens as the account signed in here (release
// gate review, 2026-11-20). auth-js 2.106.2 refreshes a stored session within
// 90 s of expiry inside `getSession()`, and with no connection retries for
// about 25 s: the launch page used to stay up that long, then the app opened
// as the guest. Launch now waits at most LAUNCH_SESSION_WAIT_MS for that read
// and, past it or on auth-js's retryable fetch error, opens as the account
// whose session is stored on this phone; the read's late answer is followed.
//
// The auth service is the real one (src/supabase/auth.ts) over a fake client
// shaped as auth-js is: its session record in `storage` under KEY, and a
// `getSession()` the test answers when it likes.

jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  clearSyncCursor: jest.fn(async () => {}),
  pushNow: jest.fn(async () => 0),
  stopSyncFor: jest.fn(async () => {}),
  resumeSyncFor: jest.fn(),
}));
jest.mock('@/db/account', () => ({
  wipeLocalUserData: jest.fn(async () => {}),
  wipeEverythingOnDevice: jest.fn(async () => []),
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

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import * as guestData from '@/db/migrateGuestData';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as scheduler from '@/notifications/scheduler';
import {
  __resetAuthMarkersForTests,
  addOwedWipe,
  owedWipeFor,
  rememberSignedOutHere,
  type MarkerStorage,
} from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { __resetAgeStoreForTests, useAgeStore } from './ageStore';
import { LAUNCH_SESSION_WAIT_MS, useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { useStatsStore } from './statsStore';

const KEY = 'sb-test-auth-token';
const USER = 'user-1';
const ACCESS = 'ACCESS-TOKEN-SECRET';
const REFRESH = 'REFRESH-TOKEN-SECRET';
const UNDER_13 = { lowerBound: null, upperBound: 12 };

const migrate = (guestData as jest.Mocked<typeof guestData>).migrateGuestDataToUser;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;
const dismissWords = (scheduler as jest.Mocked<typeof scheduler>).dismissDeliveredReminderWords;
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

/** A session as auth-js stores it: the user inside, with an Apple identity. */
function sessionFor(userId: string, access = ACCESS): Session {
  return {
    access_token: access,
    refresh_token: REFRESH,
    expires_in: 3600,
    // Expired an hour ago: auth-js would refresh it inside getSession().
    expires_at: 1_700_000_000,
    token_type: 'bearer',
    user: {
      id: userId,
      email: `${userId}@example.com`,
      aud: 'authenticated',
      created_at: '2026-11-01T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email', 'apple'] },
      user_metadata: {},
      identities: [{ provider: 'apple' }],
    },
  } as unknown as Session;
}

type SessionAnswer = { data: { session: Session | null }; error: unknown };

/**
 * auth-js as launch meets it. `getSession()` returns `read`, which the test
 * settles (or never does); the session record sits in `storage` under KEY;
 * `emit` sends an auth event to the app's listener, as auth-js does. Every
 * property the app reads off the client is recorded in `touched`.
 */
function fakeAuthJs(stored: Session | null) {
  const storage = new Map<string, string>();
  if (stored) storage.set(KEY, JSON.stringify(stored));
  let listener: ((event: string, s: Session | null) => void) | null = null;
  let resolveRead!: (v: SessionAnswer) => void;
  let rejectRead!: (e: unknown) => void;
  const read = new Promise<SessionAnswer>((resolve, reject) => {
    resolveRead = resolve;
    rejectRead = reject;
  });
  const touched: string[] = [];
  const getItem = jest.fn(async (k: string) => storage.get(k) ?? null);
  const auth = {
    storageKey: KEY,
    storage: {
      getItem,
      setItem: async (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: async (k: string) => {
        storage.delete(k);
      },
    },
    getSession: jest.fn(() => read),
    onAuthStateChange(cb: (event: string, s: Session | null) => void) {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => (listener = null) } } };
    },
  };
  const watchedAuth = new Proxy(auth, {
    get(target, prop, receiver) {
      touched.push(`auth.${String(prop)}`);
      return Reflect.get(target, prop, receiver);
    },
  });
  const client = new Proxy(
    { auth: watchedAuth },
    {
      get(target, prop, receiver) {
        if (prop !== 'auth') touched.push(String(prop));
        return Reflect.get(target, prop, receiver);
      },
    },
  ) as unknown as SupabaseClient;
  return {
    client,
    auth,
    storage,
    getItem,
    touched,
    answer: (v: SessionAnswer) => resolveRead(v),
    fail: (e: unknown) => rejectRead(e),
    emit(event: string, s: Session | null) {
      if (!listener) throw new Error('no auth-state listener installed');
      listener(event, s);
    },
    hasListener: () => listener !== null,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await jest.advanceTimersByTimeAsync(0);
}

/** Launch, with the client's read left unanswered past the wait. */
async function launchPastTheWait(): Promise<void> {
  const init = useAuthStore.getState().initialize();
  await jest.advanceTimersByTimeAsync(LAUNCH_SESSION_WAIT_MS);
  await init;
  await flush();
}

/** Whose rows each prediction-list reload was for (the auth store's id at the time). */
let pendingLoadsFor: Array<string | null>;
/** Every user id the auth store has shown, in order. */
let shown: Array<string | null>;
let unsubscribe: () => void;
let logged: string[];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  logged = [];
  const capture = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '));
  };
  jest.spyOn(console, 'warn').mockImplementation(capture);
  jest.spyOn(console, 'error').mockImplementation(capture);
  useAuthStore.getState().reset();
  __resetAuthMarkersForTests(new MemoryStorage());
  __resetAgeStoreForTests();
  pendingLoadsFor = [];
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {
      pendingLoadsFor.push(useAuthStore.getState().userId);
    }),
    loadResolved: jest.fn(async () => {}),
  });
  useStatsStore.setState({
    loadForUser: jest.fn(async () => {}),
    recomputeForUser: jest.fn(async () => {}),
  });
  useLogDraftStore.setState({ clear: jest.fn(async () => true) });
  useResolveRunStore.setState({ clear: jest.fn() });
  shown = [];
  unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.userId !== prev.userId) shown.push(state.userId);
  });
});

afterEach(() => {
  unsubscribe();
  // Nothing in the device log carries a token or the stored record.
  for (const line of logged) {
    expect(line).not.toContain(ACCESS);
    expect(line).not.toContain(REFRESH);
  }
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  __resetAgeStoreForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the client does not answer in time', () => {
  it('opens as the stored account once the wait is up, never as the guest', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);

    let done = false;
    const init = useAuthStore
      .getState()
      .initialize()
      .then(() => {
        done = true;
      });
    await jest.advanceTimersByTimeAsync(LAUNCH_SESSION_WAIT_MS - 1);
    expect(done).toBe(false);
    expect(useAuthStore.getState().status).toBe('loading');

    await jest.advanceTimersByTimeAsync(1);
    await init;
    await flush();

    expect(useAuthStore.getState()).toMatchObject({
      userId: USER,
      status: 'authenticated',
      email: `${USER}@example.com`,
      hasAppleIdentity: true,
      hasGoogleIdentity: false,
    });
    // INITIAL_SESSION was handled for the account: its lists loaded under its
    // id (Today and the reminders' reconcile read them), and its sync started.
    expect(shown).toEqual([USER]);
    expect(pendingLoadsFor).toEqual([USER]);
    expect(syncNow()).toHaveBeenCalledWith(USER, expect.anything());
    expect(migrate).not.toHaveBeenCalled();
    expect(fake.hasListener()).toBe(true);
  });

  it('opens as the guest, as before, when nothing is stored', async () => {
    const fake = fakeAuthJs(null);
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(pendingLoadsFor).toEqual([LOCAL_GUEST_USER_ID]);
  });

  it('opens as the guest when the stored record is one auth-js could not use', async () => {
    const fake = fakeAuthJs(null);
    fake.storage.set(KEY, JSON.stringify({ access_token: ACCESS, user: { id: USER } }));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('a session for an account this phone signed out of alone does not count, and leaves storage, as before', async () => {
    await rememberSignedOutHere(USER);
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(shown).toEqual([LOCAL_GUEST_USER_ID]);
    expect(fake.storage.has(KEY)).toBe(false);

    // Its late answer changes nothing: the app never opened the account.
    fake.answer({ data: { session: sessionFor(USER) }, error: null });
    await flush();
    expect(useAuthStore.getState().status).toBe('guest');
    expect(migrate).not.toHaveBeenCalled();
  });

  it('an unconfirmed deletion keeps its mark while the stored account is open', async () => {
    await addOwedWipe(USER, 'deletion');
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    expect(useAuthStore.getState().userId).toBe(USER);
    expect(wipe).not.toHaveBeenCalled();
    expect(owedWipeFor(USER)).toBe('deletion');
  });

  it('opens a frozen account the same way under the under-13 rule, and it stays frozen', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    // No sync starts under the rule, and launch read nothing new off the
    // client but the stored record: no request was added.
    expect(syncNow()).not.toHaveBeenCalled();
    expect([...new Set(fake.touched)].sort()).toEqual([
      'auth.getSession',
      'auth.onAuthStateChange',
      'auth.storage',
      'auth.storageKey',
    ]);
    expect(fake.auth.getSession).toHaveBeenCalledTimes(1);

    // The client's own first read for the listener fails too: still frozen, still the account.
    fake.emit('INITIAL_SESSION', null);
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(syncNow()).not.toHaveBeenCalled();
  });
});

describe('the client answers in time', () => {
  it('a retryable fetch error with a stored session: the account, without waiting out the wait', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    fake.answer({
      data: { session: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    });
    setSupabaseClientForTests(fake.client);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(shown).toEqual([USER]);
    expect(pendingLoadsFor).toEqual([USER]);
  });

  it('a retryable fetch error with nothing stored: the guest', async () => {
    const fake = fakeAuthJs(null);
    fake.answer({ data: { session: null }, error: new AuthRetryableFetchError('Network request failed', 0) });
    setSupabaseClientForTests(fake.client);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('a non-retryable error: signed out, as before, and the record is never read', async () => {
    // auth-js would have removed the record; it is left here to show it isn't used.
    const fake = fakeAuthJs(sessionFor(USER));
    fake.answer({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });
    setSupabaseClientForTests(fake.client);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(fake.getItem).not.toHaveBeenCalled();
  });

  it('a read that throws: the stored account, as for no answer', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    fake.fail(new Error('the lock could not be taken'));
    setSupabaseClientForTests(fake.client);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
  });

  it('online with a session: unchanged, the record unread and no timer left behind', async () => {
    const fake = fakeAuthJs(null);
    fake.answer({ data: { session: sessionFor(USER) }, error: null });
    setSupabaseClientForTests(fake.client);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(fake.getItem).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    // Only a launch opened from the record waits out a failed first read for
    // the listener: here an INITIAL_SESSION with no session moves to the
    // guest, as it always did.
    fake.emit('INITIAL_SESSION', null);
    await flush();
    expect(useAuthStore.getState().status).toBe('guest');
  });
});

describe('the late answer, after the account opened from the record', () => {
  it('a refresh that lands: the same account, no second reload, no guest rows moved', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();
    expect(pendingLoadsFor).toEqual([USER]);
    syncNow().mockClear();

    // As auth-js does it: the new session saved, TOKEN_REFRESHED sent, then
    // getSession() returns it.
    const refreshed = sessionFor(USER, 'ACCESS-TOKEN-SECRET-2');
    fake.storage.set(KEY, JSON.stringify(refreshed));
    fake.emit('TOKEN_REFRESHED', refreshed);
    fake.answer({ data: { session: refreshed }, error: null });
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(shown).toEqual([USER]);
    expect(pendingLoadsFor).toEqual([USER]);
    expect(migrate).not.toHaveBeenCalled();
    // The account syncs now that its session is good.
    expect(syncNow()).toHaveBeenCalledWith(USER, expect.anything());

    // The listener's own first read then carries the session: nothing changes.
    fake.emit('INITIAL_SESSION', refreshed);
    await flush();
    expect(shown).toEqual([USER]);
    expect(pendingLoadsFor).toEqual([USER]);
  });

  it('a refresh that landed before the listener existed: the read alone confirms it', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();
    fake.answer({ data: { session: sessionFor(USER) }, error: null });
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(pendingLoadsFor).toEqual([USER]);
  });

  it('still no connection: the account stays, through the listener’s failed first read, until a real sign-out', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    fake.answer({ data: { session: null }, error: new AuthRetryableFetchError('Network request failed', 0) });
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });

    // auth-js sends INITIAL_SESSION with no session when the listener's first
    // read can't refresh either; it keeps the session.
    fake.emit('INITIAL_SESSION', null);
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(pendingLoadsFor).toEqual([USER]);
    expect(shown).toEqual([USER]);

    // A refresh the server refuses later: auth-js removes the session and sends SIGNED_OUT.
    fake.storage.delete(KEY);
    fake.emit('SIGNED_OUT', null);
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
  });

  it('a refusal with no SIGNED_OUT heard: signed out here, the account left as a session that ended', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    fake.storage.delete(KEY);
    fake.answer({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });
    await flush();

    expect(useAuthStore.getState()).toMatchObject({
      userId: LOCAL_GUEST_USER_ID,
      status: 'guest',
      email: null,
      hasAppleIdentity: false,
    });
    expect(shown).toEqual([USER, LOCAL_GUEST_USER_ID]);
    expect(pendingLoadsFor).toEqual([USER, LOCAL_GUEST_USER_ID]);
    // Leaving an account: its draft and the lock screen's words go.
    expect(useLogDraftStore.getState().clear).toHaveBeenCalled();
    expect(dismissWords).toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it('a refusal after SIGNED_OUT was heard: the guest once, not twice', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    fake.storage.delete(KEY);
    fake.emit('SIGNED_OUT', null);
    fake.answer({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used'),
    });
    await flush();
    // And the listener's first read, after the removal: no session, no error.
    fake.emit('INITIAL_SESSION', null);
    await flush();

    expect(useAuthStore.getState().status).toBe('guest');
    expect(shown).toEqual([USER, LOCAL_GUEST_USER_ID]);
    expect(pendingLoadsFor).toEqual([USER, LOCAL_GUEST_USER_ID]);
  });

  it('a refusal for an account owed a deletion’s wipe: its rows go, as when its session ends any other way', async () => {
    await addOwedWipe(USER, 'deletion');
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();
    expect(wipe).not.toHaveBeenCalled();

    fake.storage.delete(KEY);
    fake.answer({ data: { session: null }, error: new AuthApiError('User not found', 403, 'user_not_found') });
    await flush();

    expect(useAuthStore.getState().status).toBe('guest');
    expect(wipe).toHaveBeenCalledWith(USER, { deviceData: false });
    expect(owedWipeFor(USER)).toBeNull();
  });

  it('a read that throws late: the account stays, and the log carries no token', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    fake.fail(Object.assign(new Error('storage write refused'), { session: sessionFor(USER) }));
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ userId: USER, status: 'authenticated' });
    expect(logged.some((line) => line.includes('the session read at launch failed'))).toBe(true);
  });

  it('a late answer after the person signed out meanwhile changes nothing', async () => {
    const fake = fakeAuthJs(sessionFor(USER));
    setSupabaseClientForTests(fake.client);
    await launchPastTheWait();

    // The account ended another way first (here, SIGNED_OUT from the client).
    fake.storage.delete(KEY);
    fake.emit('SIGNED_OUT', null);
    await flush();
    const loadsBefore = pendingLoadsFor.length;

    fake.answer({ data: { session: null }, error: null });
    await flush();
    expect(useAuthStore.getState().status).toBe('guest');
    expect(pendingLoadsFor).toHaveLength(loadsBefore);
  });
});

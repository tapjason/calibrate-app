// The under-13 rule in the auth store (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). The sign-in and sign-up
// services are the real ones, over a Supabase client whose every property
// access throws: an action that reached a service would touch it. The rest of
// the services are mocked.

jest.mock('@/supabase/auth', () => ({
  ...jest.requireActual('@/supabase/auth'),
  signOut: jest.fn(async () => ({ ok: true })),
  signOutLocal: jest.fn(async () => ({ ok: true })),
  reauthenticateWithApple: jest.fn(async () => null),
  discardStoredSession: jest.fn(async () => {}),
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
import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import { __resetAuthMarkersForTests, type MarkerStorage } from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { __resetAgeStoreForTests, useAgeStore } from './ageStore';
import { LOCAL_ONLY_SIGN_IN, syncForUser, useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { __setPersistenceForTests } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

const mockedAuth = auth as jest.Mocked<typeof auth>;
const server = serverAccount as jest.Mocked<typeof serverAccount>;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;
const wipeAll = (localAccount as jest.Mocked<typeof localAccount>).wipeEverythingOnDevice;
const sync = () =>
  jest.requireMock('@/supabase/sync') as { syncNow: jest.Mock; pushNow: jest.Mock };

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const REFUSED = { ok: false, error: LOCAL_ONLY_SIGN_IN };

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

/** The rule on, as a stored under-13 band read at launch would turn it on. */
function underTheRule(): void {
  useAgeStore.getState().load(UNDER_13, { willAsk: false });
}

/**
 * A client whose every property access throws, and the properties tried.
 * `allowAuth` lets `auth.getSession` and `auth.onAuthStateChange` through,
 * for a launch; anything else still throws.
 */
function throwingClient(allowAuth?: {
  session: Session | null;
  onListener: (cb: (event: string, s: Session | null) => void) => void;
}) {
  const touched: string[] = [];
  const refuse = (path: string): never => {
    touched.push(path);
    throw new Error(`nothing may reach the network here: ${path}`);
  };
  const authObject = new Proxy(
    {},
    {
      get(_target, prop) {
        if (allowAuth && prop === 'getSession') {
          return async () => ({ data: { session: allowAuth.session } });
        }
        if (allowAuth && prop === 'onAuthStateChange') {
          return (cb: (event: string, s: Session | null) => void) => {
            allowAuth.onListener(cb);
            return { data: { subscription: { unsubscribe: () => {} } } };
          };
        }
        return refuse(`auth.${String(prop)}`);
      },
    },
  );
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        if (allowAuth && prop === 'auth') return authObject;
        return refuse(String(prop));
      },
    },
  ) as unknown as SupabaseClient;
  return { client, touched };
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

/** Starts the app with `stored` as the stored session; returns a way to send auth events and what the client saw. */
async function launch(stored: Session | null) {
  let listener: ((event: string, s: Session | null) => void) | null = null;
  const { client, touched } = throwingClient({
    session: stored,
    onListener: (cb) => {
      listener = cb;
    },
  });
  setSupabaseClientForTests(client);
  await useAuthStore.getState().initialize();
  const emit = async (event: string, session: Session | null) => {
    listener?.(event, session);
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  };
  return { emit, touched };
}

/** The account's sign-in actions, as the store has them: every `sign(In|Up)…`. */
function signInActions(): Array<[string, (...args: unknown[]) => Promise<unknown>]> {
  const state = useAuthStore.getState() as unknown as Record<string, unknown>;
  return Object.keys(state)
    .filter((name) => /^sign(In|Up)/.test(name))
    .map((name) => [name, state[name] as (...args: unknown[]) => Promise<unknown>]);
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  __resetAuthMarkersForTests(new MemoryStorage());
  __resetAgeStoreForTests();
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {}),
    loadResolved: jest.fn(async () => {}),
  });
  useStatsStore.setState({ loadForUser: jest.fn(async () => {}), recomputeForUser: jest.fn(async () => {}) });
  useLogDraftStore.setState({ clear: jest.fn(async () => {}) });
  useResolveRunStore.setState({ clear: jest.fn() });
  useWarmupStore.setState({ retake: jest.fn(async () => {}) });
  usePracticeStore.setState({ clear: jest.fn(async () => {}) });
});

afterEach(() => {
  jest.useRealTimers();
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  __resetAgeStoreForTests();
  __setPersistenceForTests(null);
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('sign-in and sign-up under the rule (D70)', () => {
  // Enumerated off the store, so a new sign-in or sign-up action is covered
  // without editing this test.
  it('every sign(In|Up) action refuses, touching no client', async () => {
    underTheRule();
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const actions = signInActions();
    expect(actions.map(([name]) => name)).toEqual(
      expect.arrayContaining(['signInWithEmail', 'signUpWithEmail', 'signInWithApple', 'signInWithGoogle']),
    );
    for (const [name, action] of actions) {
      await expect({ name, outcome: await action('a@b.co', 'a-long-enough-password') }).toEqual({
        name,
        outcome: REFUSED,
      });
    }
    expect(touched).toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({ pending: false, status: 'loading' });
  });

  // The test above would see a missing gate: without the rule, the same
  // client is touched and the answer is something else.
  it('without the rule, the same actions reach the client', async () => {
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const outcome = await useAuthStore.getState().signInWithEmail('a@b.co', 'a-long-enough-password');

    expect(outcome).toMatchObject({ ok: false });
    expect(outcome).not.toEqual(REFUSED);
    expect(touched.length).toBeGreaterThan(0);
  });

  it('names no age more precisely than "the age range"', () => {
    expect(LOCAL_ONLY_SIGN_IN).toBe(
      'Accounts are off on this phone because of the age range it shares with Fairly Sure.',
    );
    expect(LOCAL_ONLY_SIGN_IN).not.toMatch(/\d|under|child|kid|young/i);
  });

  it('on a launch that asks, waits for the answer, then refuses an under-13 band', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const call = useAuthStore.getState().signInWithEmail('a@b.co', 'a-long-enough-password');
    expect(useAuthStore.getState().pending).toBe(true);

    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();

    await expect(call).resolves.toEqual(REFUSED);
    expect(touched).toEqual([]);
    expect(useAuthStore.getState().pending).toBe(false);
  });

  it('on a launch that asks, goes on after 5 s with no answer', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const call = useAuthStore.getState().signInWithEmail('a@b.co', 'a-long-enough-password');
    await jest.advanceTimersByTimeAsync(4999);
    expect(touched).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    const outcome = await call;

    expect(outcome).not.toEqual(REFUSED);
    expect(touched.length).toBeGreaterThan(0);
  });
});

describe('an account signed in under the rule is frozen, not signed out', () => {
  it('a stored session stays signed in and starts no sync', async () => {
    underTheRule();
    const { emit, touched } = await launch(sessionFor('user-1'));

    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    await emit('TOKEN_REFRESHED', sessionFor('user-1'));

    expect(sync().syncNow).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
    expect(wipeAll).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(touched).toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
  });

  it('a band arriving mid-session wipes nothing and signs nobody out', async () => {
    const { emit } = await launch(sessionFor('user-1'));
    expect(sync().syncNow).toHaveBeenCalledTimes(1);
    sync().syncNow.mockClear();

    await useAgeStore.getState().accept(UNDER_13);
    await emit('TOKEN_REFRESHED', sessionFor('user-1'));

    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(wipe).not.toHaveBeenCalled();
    expect(wipeAll).not.toHaveBeenCalled();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(sync().syncNow).not.toHaveBeenCalled();
  });

  it('syncForUser sends nothing under the rule', async () => {
    underTheRule();
    await expect(syncForUser('user-1')).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(sync().syncNow).not.toHaveBeenCalled();
  });

  it('Delete account still reaches the server, and the gate stays on after its wipe', async () => {
    await useAgeStore.getState().accept(UNDER_13);
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });

    expect(server.deleteAccountOnServer).toHaveBeenCalledWith(null, { expectedUserId: 'user-1' });
    expect(wipe).toHaveBeenCalledWith('user-1');
    // The stored band went with the wipe (call 4): forgotten, the gate kept.
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true });
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
  });

  it('a deletion whose wipe failed leaves the band as the store knew it', async () => {
    await useAgeStore.getState().accept(UNDER_13);
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });
    wipe.mockRejectedValueOnce(new Error('disk'));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true });
  });

  it('Sign out still works', async () => {
    underTheRule();
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(useAuthStore.getState()).toMatchObject({ userId: LOCAL_GUEST_USER_ID, status: 'guest' });
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    // The rule stays: sign-out keeps the age band.
    expect(useAgeStore.getState().localOnly).toBe(true);
  });
});

describe('guest Erase under the rule', () => {
  it('forgets the band after the wipe, and keeps the gate on for the run', async () => {
    await useAgeStore.getState().accept(UNDER_13);
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });

    expect(wipeAll).toHaveBeenCalledTimes(1);
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true });
  });

  it('a failed wipe forgets nothing', async () => {
    await useAgeStore.getState().accept(UNDER_13);
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });
    wipeAll.mockRejectedValueOnce(new Error('disk'));

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true });
  });
});

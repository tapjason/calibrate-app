// Tests for the L4 auth store. Two execution modes:
//   1. Pure offline (no Supabase env vars, no injected client) — runs as
//      guest, userId = LOCAL_GUEST_USER_ID.
//   2. With a mocked SupabaseClient — exercises the session subscription
//      and the guest→authenticated migration path.
//
// Mocking strategy: setSupabaseClientForTests injects a stub that exposes
// auth.getSession and auth.onAuthStateChange. Tests fire the callback
// directly to simulate signin/signout.

import type { Session } from '@supabase/supabase-js';

import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { setSupabaseClientForTests } from '@/supabase/client';

// Stub the L5 sync module so authStore's fire-and-forget syncNow on signin
// doesn't try to hit a real Supabase client or AsyncStorage during tests.
// Coverage of sync itself lives in src/supabase/sync.test.ts.
jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  __resetSyncStateForTests: jest.fn(),
}));

import { useAuthStore } from './authStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';

interface FakeAuth {
  getSession(): Promise<{ data: { session: Session | null } }>;
  onAuthStateChange(
    cb: (event: string, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } };
  /** Test helper: fire the callback as if Supabase reported a new session. */
  __emit(event: string, session: Session | null): void;
}

function makeFakeAuth(initialSession: Session | null): FakeAuth {
  let callback: ((event: string, session: Session | null) => void) | null = null;
  return {
    async getSession() {
      return { data: { session: initialSession } };
    },
    onAuthStateChange(cb) {
      callback = cb;
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              callback = null;
            },
          },
        },
      };
    },
    __emit(event, session) {
      if (!callback) throw new Error('no auth-state listener installed');
      callback(event, session);
    },
  };
}

function makeFakeClient(initialSession: Session | null = null) {
  const auth = makeFakeAuth(initialSession);
  return {
    client: { auth } as unknown as Parameters<typeof setSupabaseClientForTests>[0],
    auth,
  };
}

function fakeSession(userId: string, email = 'u@example.com'): Session {
  return {
    access_token: 't',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Date.now() / 1000 + 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
    },
  } as unknown as Session;
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  setSupabaseClientForTests(null);
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [] });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
});

afterEach(() => {
  setDbForTests(null);
  setSupabaseClientForTests(null);
  useAuthStore.getState().reset();
});

describe('authStore — offline (no Supabase configured)', () => {
  it('starts in loading state', () => {
    expect(useAuthStore.getState().status).toBe('loading');
    expect(useAuthStore.getState().userId).toBeNull();
  });

  it('initialize() falls back to guest mode when Supabase is not configured', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe(LOCAL_GUEST_USER_ID);
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('initialize() is idempotent', async () => {
    await useAuthStore.getState().initialize();
    const id = useAuthStore.getState().userId;
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe(id);
  });

  it('reset() drops the session and lets initialize re-run', async () => {
    await useAuthStore.getState().initialize();
    useAuthStore.getState().reset();
    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAuthStore.getState().status).toBe('loading');

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe(LOCAL_GUEST_USER_ID);
  });
});

describe('authStore — with Supabase client', () => {
  it('starts as guest when there is no stored session', async () => {
    const { client } = makeFakeClient(null);
    setSupabaseClientForTests(client);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().userId).toBe(LOCAL_GUEST_USER_ID);
  });

  it('starts authenticated when Supabase already has a session', async () => {
    const session = fakeSession('real-user-uuid');
    const { client } = makeFakeClient(session);
    setSupabaseClientForTests(client);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().userId).toBe('real-user-uuid');
    expect(useAuthStore.getState().email).toBe('u@example.com');
  });

  it('migrates guest predictions to the new user_id on first sign-in', async () => {
    // Start as guest, create a couple of predictions.
    const { client, auth } = makeFakeClient(null);
    setSupabaseClientForTests(client);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe(LOCAL_GUEST_USER_ID);

    await usePredictionStore.getState().create({
      title: 'Guest one',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().create({
      title: 'Guest two',
      category: 'health',
      confidence: 70,
      due_date: '2026-06-02T00:00:00.000Z',
    });
    expect(usePredictionStore.getState().pending).toHaveLength(2);

    // Now simulate Supabase reporting a fresh session.
    auth.__emit('SIGNED_IN', fakeSession('real-user-uuid'));

    // Migration is async — let the handleSession promise settle.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().userId).toBe('real-user-uuid');
    // Both predictions are still visible (now owned by the real user).
    const pending = usePredictionStore.getState().pending;
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.user_id === 'real-user-uuid')).toBe(true);
    // Stats were rebuilt from the migrated predictions.
    expect(useStatsStore.getState().userStat?.total_predictions).toBe(2);
  });

  it('falls back to guest mode on sign-out', async () => {
    const session = fakeSession('real-user-uuid');
    const { client, auth } = makeFakeClient(session);
    setSupabaseClientForTests(client);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().userId).toBe('real-user-uuid');

    auth.__emit('SIGNED_OUT', null);
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().userId).toBe(LOCAL_GUEST_USER_ID);
    expect(useAuthStore.getState().status).toBe('guest');
    expect(useAuthStore.getState().email).toBeNull();
  });

  it('does not re-migrate on token refresh (same userId)', async () => {
    const session = fakeSession('real-user-uuid');
    const { client, auth } = makeFakeClient(session);
    setSupabaseClientForTests(client);
    await useAuthStore.getState().initialize();

    // Insert a prediction directly as the real user (post-signin state).
    await usePredictionStore.getState().create({
      title: 'After signin',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T00:00:00.000Z',
    });

    // TOKEN_REFRESHED fires with the same user — must NOT trigger another
    // migration sweep (it would no-op anyway since the guest user_id has no
    // rows, but we shouldn't even attempt a reload churn).
    const before = usePredictionStore.getState().pending;
    auth.__emit('TOKEN_REFRESHED', fakeSession('real-user-uuid'));
    await new Promise((r) => setImmediate(r));

    expect(usePredictionStore.getState().pending).toEqual(before);
  });
});

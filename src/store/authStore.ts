// Auth state. Subscribes to Supabase's onAuthStateChange and exposes the
// current user_id to the rest of the app. Two important properties:
//
//   1. Offline-safe. If Supabase isn't configured (env vars missing), or
//      the user hasn't signed in yet, userId is the device-local guest
//      placeholder. The Log → Resolve → Stats core loop works without a
//      session.
//
//   2. Guest→authenticated handoff. On the first signin event after the
//      app was running as a guest, we migrate every guest-owned row in
//      SQLite over to the new user_id and trigger a stats recompute.
//      Without this, users would lose their pre-signin data.
//
// Layer rule: L4 (state). May import from L2 (db) and L5 (services). The
// inverse — L5 importing L4 — is what stores must avoid.
//
// Tests inject a fake Supabase client via setSupabaseClientForTests, then
// call initialize() and exercise the onAuthStateChange callback directly.

import { create } from 'zustand';
import type {
  Session,
  Subscription,
  SupabaseClient,
} from '@supabase/supabase-js';

import {
  LOCAL_GUEST_USER_ID,
  migrateGuestDataToUser,
} from '@/db/migrateGuestData';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/supabase/client';
import { syncNow } from '@/supabase/sync';

import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';

export type AuthStatus = 'loading' | 'guest' | 'authenticated';

interface AuthState {
  /**
   * The user_id every db helper uses. Always non-null after `initialize()`:
   * either LOCAL_GUEST_USER_ID (no session) or the Supabase user.id.
   */
  userId: string | null;
  email: string | null;
  status: AuthStatus;

  initialize: () => Promise<void>;
  /** Test-only: drop the session. Production sign-out goes through supabase/auth. */
  reset: () => void;
}

let authSubscription: Subscription | null = null;
let didInitialize = false;
let lastUserId: string | null = null;

/**
 * Reload the predictions and stats stores for the newly-active user. Called
 * on every userId transition (including guest mode) so screens reflect the
 * right account immediately.
 */
async function reloadForUser(userId: string): Promise<void> {
  await Promise.all([
    usePredictionStore.getState().loadPending(),
    usePredictionStore.getState().loadResolved(),
    useStatsStore.getState().loadForUser(userId),
  ]);
}

/**
 * Compute the new auth state from a session. Pure — testable without touching
 * the store.
 */
function sessionToState(session: Session | null): {
  userId: string;
  email: string | null;
  status: AuthStatus;
} {
  if (!session?.user) {
    return { userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' };
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    status: 'authenticated',
  };
}

async function handleSession(session: Session | null, set: (s: Partial<AuthState>) => void): Promise<void> {
  const next = sessionToState(session);
  const prevUserId = lastUserId;
  lastUserId = next.userId;

  // Guest→authenticated transition: move local rows over to the real id
  // before reloading the stores, so the reload sees the merged data.
  if (
    prevUserId === LOCAL_GUEST_USER_ID &&
    next.status === 'authenticated' &&
    next.userId !== LOCAL_GUEST_USER_ID
  ) {
    try {
      const { predictionsMoved } = await migrateGuestDataToUser(next.userId);
      if (predictionsMoved > 0) {
        // Stats were just deleted by the migration; recompute from the
        // moved predictions before the reload picks them up.
        await useStatsStore.getState().recomputeForUser(next.userId);
      }
    } catch (e) {
      // Don't block sign-in on migration failure — the session is valid,
      // we just couldn't carry guest data forward.
      // eslint-disable-next-line no-console
      console.warn('[auth] guest data migration failed:', e);
    }
  }

  set(next);

  // Only reload stores if the user actually changed. Token refresh events
  // also fire onAuthStateChange but keep the same userId.
  if (prevUserId !== next.userId) {
    try {
      await reloadForUser(next.userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] post-signin store reload failed:', e);
    }
  }

  // Fire-and-forget Supabase sync for authenticated users. syncNow no-ops
  // for guests, no-ops when Supabase isn't configured, and swallows its own
  // errors — auth init must not block on network.
  if (next.status === 'authenticated') {
    void syncNow(next.userId);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  email: null,
  status: 'loading',

  initialize: async () => {
    if (didInitialize) return;
    didInitialize = true;

    if (!isSupabaseConfigured()) {
      // Pure offline mode — no Supabase wiring, just the guest placeholder.
      lastUserId = LOCAL_GUEST_USER_ID;
      set({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
      return;
    }

    let client: SupabaseClient;
    try {
      client = getSupabaseClient();
    } catch (e) {
      // Shouldn't happen given isSupabaseConfigured passed, but if it does,
      // degrade gracefully to guest mode so the offline loop still works.
      // eslint-disable-next-line no-console
      console.warn('[auth] Supabase client unavailable, running as guest:', e);
      lastUserId = LOCAL_GUEST_USER_ID;
      set({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
      return;
    }

    // Read whatever session AsyncStorage already has (warm start), then
    // subscribe to future changes.
    const { data } = await client.auth.getSession();
    await handleSession(data.session, set);

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      void handleSession(session, set);
    });
    authSubscription = sub.subscription;
  },

  reset: () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('useAuthStore.reset is only allowed when NODE_ENV=test');
    }
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
    didInitialize = false;
    lastUserId = null;
    set({ userId: null, email: null, status: 'loading' });
  },
}));

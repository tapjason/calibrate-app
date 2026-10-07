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

import { wipeLocalUserData } from '@/db/account';
import {
  LOCAL_GUEST_USER_ID,
  migrateGuestDataToUser,
} from '@/db/migrateGuestData';
import { deleteAccountOnServer } from '@/supabase/account';
import * as auth from '@/supabase/auth';
import type { AuthOutcome, SignUpOutcome } from '@/supabase/auth';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/supabase/client';
import { syncNow } from '@/supabase/sync';

import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

export type AuthStatus = 'loading' | 'guest' | 'authenticated';

interface AuthState {
  /**
   * The user_id every db helper uses. Always non-null after `initialize()`:
   * either LOCAL_GUEST_USER_ID (no session) or the Supabase user.id.
   */
  userId: string | null;
  email: string | null;
  status: AuthStatus;
  /**
   * How the signed-in account signs in ('email', 'apple', 'google'), from
   * the session's app_metadata. Null for a guest. Deletion needs it: an Apple
   * account's Sign in with Apple grant has to be revoked too.
   */
  provider: string | null;
  /**
   * Whether signing in is possible at all on this build — false when the
   * Supabase env vars are missing, in which case the app is guest-only and
   * no screen should offer an account.
   */
  accountsAvailable: boolean;
  /** A sign-in, sign-up or sign-out is in flight. */
  pending: boolean;

  initialize: () => Promise<void>;
  /**
   * Account actions. Each returns the service's outcome unchanged so the
   * screen can show the error; none of them touches local state directly.
   * A new session arrives through onAuthStateChange, which already does the
   * guest handoff, the store reload and the first sync — and billing follows
   * the userId change on its own (src/billing/init.ts).
   */
  signInWithEmail: (email: string, password: string) => Promise<AuthOutcome>;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpOutcome>;
  signInWithApple: () => Promise<AuthOutcome>;
  /**
   * Sign out. Local predictions stay on the device under the account's id —
   * the app drops back to an empty guest view, and signing back in shows
   * everything again. Nothing is lost, so nothing asks for confirmation.
   */
  signOut: () => Promise<AuthOutcome>;
  /**
   * Delete the signed-in account (docs/ACCOUNT_SPEC.md §3.2). The server
   * deletes first; only on its confirmation is this device wiped and the
   * session dropped. A failure changes nothing anywhere, so the user can
   * simply try again.
   */
  deleteAccount: () => Promise<AuthOutcome>;
  /**
   * A guest's equivalent (§3.5): erase everything the app stored on this
   * device, the Warmup included. Nothing to call — it never left the phone.
   */
  eraseDeviceData: () => Promise<AuthOutcome>;
  /** Test-only: drop the session. */
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
 * A sync, then the stores refreshed from what it wrote. syncNow's own
 * recompute rebuilds the stats; the lists Home, History and the streak read
 * need a reload too, or pulled rows stay out of sight until the next log, and
 * an answer's "before" streak misses them. Every app-level sync goes through
 * here; the reload lives in the store layer so the sync module needn't
 * import predictionStore.
 */
export function syncForUser(userId: string | null): ReturnType<typeof syncNow> {
  return syncNow(userId, { recompute: refreshAfterSync });
}

async function refreshAfterSync(userId: string): Promise<void> {
  await useStatsStore.getState().recomputeForUser(userId);
  const predictions = usePredictionStore.getState();
  await Promise.all([predictions.loadPending(), predictions.loadResolved()]);
}

/**
 * Compute the new auth state from a session. Pure — testable without touching
 * the store.
 */
function sessionToState(session: Session | null): {
  userId: string;
  email: string | null;
  status: AuthStatus;
  provider: string | null;
} {
  if (!session?.user) {
    return { userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest', provider: null };
  }
  const provider = session.user.app_metadata?.provider;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    status: 'authenticated',
    provider: typeof provider === 'string' ? provider : null,
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
    void syncForUser(next.userId);
  }
}

/** Run one account action with `pending` held for its duration. */
async function withPending<T>(
  set: (s: Partial<AuthState>) => void,
  action: () => Promise<T>,
): Promise<T> {
  set({ pending: true });
  try {
    return await action();
  } finally {
    set({ pending: false });
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  email: null,
  status: 'loading',
  provider: null,
  accountsAvailable: false,
  pending: false,

  initialize: async () => {
    if (didInitialize) return;
    didInitialize = true;

    if (!isSupabaseConfigured()) {
      // Pure offline mode — no Supabase wiring, just the guest placeholder.
      lastUserId = LOCAL_GUEST_USER_ID;
      set({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest', provider: null });
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
      set({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest', provider: null });
      return;
    }

    set({ accountsAvailable: true });

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
    set({
      userId: null,
      email: null,
      status: 'loading',
      provider: null,
      accountsAvailable: false,
      pending: false,
    });
  },

  signInWithEmail: (email, password) =>
    withPending(set, () => auth.signInWithEmail(email, password)),
  signUpWithEmail: (email, password) =>
    withPending(set, () => auth.signUpWithEmail(email, password)),
  signInWithApple: () => withPending(set, () => auth.signInWithApple()),
  signOut: () => withPending(set, () => auth.signOut()),

  deleteAccount: () =>
    withPending(set, async (): Promise<AuthOutcome> => {
      const { status, userId, provider } = get();
      if (status !== 'authenticated' || !userId) {
        return { ok: false, error: 'Not signed in.' };
      }

      // Null if declined or unavailable; the server then skips revocation.
      const appleCode = provider === 'apple' ? await auth.reauthenticateWithApple() : null;

      const outcome = await deleteAccountOnServer(appleCode);
      if (!outcome.ok) return outcome;

      // The account is gone. From here nothing may report failure — the
      // user's request has been carried out, and "try again" would hit a
      // deleted account. A local step that fails is logged and passed over.
      try {
        await wipeLocalUserData(userId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[auth] local wipe after account deletion failed:', e);
      }
      // Local, not global: every server session died with the user. This
      // fires onAuthStateChange, which returns the app to an empty guest and
      // lets billing log out and drop Plus.
      const signedOut = await auth.signOutLocal();
      if (!signedOut.ok) {
        // eslint-disable-next-line no-console
        console.warn('[auth] local sign-out after account deletion failed:', signedOut.error);
      }
      return { ok: true };
    }),

  eraseDeviceData: () =>
    withPending(set, async (): Promise<AuthOutcome> => {
      if (get().status !== 'guest') {
        return { ok: false, error: 'Signed-in accounts are deleted from Delete account.' };
      }
      try {
        await wipeLocalUserData(LOCAL_GUEST_USER_ID);
        await useWarmupStore.getState().retake();
        // Practice, like the Warmup, belongs to the device (roadmap step 88).
        await usePracticeStore.getState().clear();
        await reloadForUser(LOCAL_GUEST_USER_ID);
        return { ok: true };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[auth] erase failed:', e);
        return { ok: false, error: "Couldn't finish erasing your data. Try again." };
      }
    }),
}));

// Auth state. Subscribes to Supabase's onAuthStateChange and exposes the
// current user_id to the rest of the app. Two important properties:
//
//   1. Offline-safe. If Supabase isn't configured (env vars missing), or
//      the user hasn't signed in yet, userId is the device-local guest
//      placeholder. The Log → Resolve → Stats core loop works without a
//      session.
//
//   2. Guest→authenticated handoff. When a sign-in the person started lands
//      while the app is the guest, we migrate every guest-owned row in
//      SQLite over to the new user_id and trigger a stats recompute.
//      Without this, users would lose their pre-signin data. Only that
//      sign-in moves them: a session that arrives any other way (a token
//      refresh that landed after this phone signed out alone) never takes
//      the guest's rows (security review round 5, client reviewer LOW-A).
//
// Sign-out takes the account's rows off the phone (owner decision
// 2026-11-19, D69 (a)): one more push, then, if anything is still unsynced
// and the person hasn't said to discard it, nothing happens and the screen
// asks; otherwise the session ends and the rows go. The guest's Warm-up and
// practice stay.
//
// Layer rule: L4 (state). May import from L2 (db) and L5 (services): the
// Supabase client, auth, account and sync modules and the account markers,
// two functions of the reminder scheduler (after a wipe, and on leaving an
// account), and the cache sweeps of the share, export and icon modules
// (after a wipe).
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
import { countUnsynced } from '@/db/predictions';
import {
  dismissDeliveredNotifications,
  dismissDeliveredReminderWords,
} from '@/notifications/scheduler';
import { DELETE_FAILED_MESSAGE, deleteAccountOnServer } from '@/supabase/account';
import * as auth from '@/supabase/auth';
import type {
  AuthOutcome,
  SessionEndOutcome,
  SignOutOutcome,
  SignUpOutcome,
} from '@/supabase/auth';
import * as markers from '@/supabase/authMarkers';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/supabase/client';
import {
  clearSyncCursor,
  pushNow,
  resumeSyncFor,
  stopSyncFor,
  syncNow,
} from '@/supabase/sync';

import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { useResolveRunStore } from './resolveRunStore';
import { useSettingsStore } from './settingsStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

export type AuthStatus = 'loading' | 'guest' | 'authenticated';

/**
 * How account deletion ended. Done carries `appleNotRevoked`: the account had
 * a Sign in with Apple identity and its grant may still stand, so the finished
 * screen says where to remove the app (docs/ACCOUNT_SPEC.md §3.2 step 5).
 * False for an account with no Apple identity.
 */
export type DeleteAccountResult =
  | { ok: true; appleNotRevoked: boolean }
  | { ok: false; error: string };

/** Options for `signOut`. */
export interface SignOutOptions {
  /**
   * The person has been told how many changes haven't reached the server
   * (`{ ok: false, unsynced }`) and chose to sign out anyway: the account's
   * rows leave the phone with them.
   */
  discardUnsynced?: boolean;
}

/**
 * Sign-out couldn't count what this phone holds that the server doesn't, so
 * it can't say what signing out would lose: nothing was changed.
 */
export const SIGN_OUT_CHECK_FAILED =
  "Couldn't check whether everything on this phone is backed up, so you're still signed in. Try again.";

interface AuthState {
  /**
   * The user_id every db helper uses. Always non-null after `initialize()`:
   * either LOCAL_GUEST_USER_ID (no session) or the Supabase user.id.
   */
  userId: string | null;
  email: string | null;
  status: AuthStatus;
  /**
   * Whether the signed-in account has a Sign in with Apple identity
   * (`hasAppleIdentity` in src/supabase/auth.ts): one made with Apple, or one
   * made with email that Supabase later linked to Apple through the same
   * address. False for a guest. Deletion needs it: the account's Sign in with
   * Apple grant has to be revoked too. Not `app_metadata.provider`, which
   * names only the first way the account signed in (policy audit, 2026-11-18).
   */
  hasAppleIdentity: boolean;
  /**
   * Whether the signed-in account has a Google identity (`hasGoogleIdentity`
   * in src/supabase/auth.ts), made with Google or linked to it later. False
   * for a guest. Deletion uses it only to say how to remove the app from the
   * Google Account too: the app holds no Google token to revoke (step 192).
   */
  hasGoogleIdentity: boolean;
  /**
   * Whether signing in is possible at all on this build — false when the
   * Supabase env vars are missing, in which case the app is guest-only and
   * no screen should offer an account.
   */
  accountsAvailable: boolean;
  /**
   * A sign-in, sign-up, sign-out or deletion is in flight, or a sign-out the
   * Supabase client is still running after this phone ended the session alone
   * (`auth.signOutStillSettling`, at most 60 s more): no sign-in may start
   * underneath it. Screens disable their account buttons while it's true.
   */
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
  /** Google through the system sign-in sheet (step 192; iOS only). */
  signInWithGoogle: () => Promise<AuthOutcome>;
  /**
   * Sign out, and take the account's rows off this phone (D69 (a)).
   *
   * 1. One more push. 2. Anything still unsynced, and `discardUnsynced`
   * isn't set: `{ ok: false, unsynced }`, and nothing changes (still signed
   * in, every row here). 3. Otherwise the session ends, online or on this
   * phone alone as before (`localOnly`), then the account's rows are wiped
   * (its predictions, stats, categories, counts; not the Warm-up, the age
   * band or practice), its sync cursor cleared and the cached copies swept,
   * then everything a sign-out did before: the guest, billing logged out and
   * dropped to free, reminders still to come cancelled with the reload,
   * reminders showing words dismissed, the Coach, the Log draft and the
   * answer run cleared.
   *
   * `{ ok: false, error }` when the session couldn't be ended even on this
   * phone (still signed in, nothing wiped; reminders showing words still
   * leave the lock screen), or when what's unsynced couldn't be counted
   * (`SIGN_OUT_CHECK_FAILED`; nothing changed). A wipe that fails after the
   * session ended is retried at the next launch.
   */
  signOut: (opts?: SignOutOptions) => Promise<SignOutOutcome>;
  /**
   * Delete the signed-in account (docs/ACCOUNT_SPEC.md §3.2). The server
   * deletes first; only on its confirmation is this device wiped and the
   * session dropped. A failure changes nothing anywhere, so the user can
   * simply try again. Done says whether Sign in with Apple may still list
   * the app (`appleNotRevoked`).
   */
  deleteAccount: () => Promise<DeleteAccountResult>;
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
/** Sign-ins the person started that are under way (`asPersonSignIn`). */
let signInsInFlight = 0;
/** Account actions, and sign-outs still settling, that hold `pending` up. */
let pendingHolds = 0;
/**
 * Accounts whose wipe the running sign-out or deletion does itself: a
 * SIGNED_OUT the Supabase client sends meanwhile doesn't start a second one.
 */
const wipesInHand = new Set<string>();

/** The event handleSession gets when the app's own sign-out or deletion ends a session. */
const APP_SIGN_OUT = 'APP_SIGN_OUT';

/**
 * An error as the device log may carry it: its code and message, never the
 * object (security review, 2026-11-18).
 */
function errorForLog(e: unknown): string {
  if (typeof e !== 'object' || e === null) return 'unknown error';
  const { code, message } = e as { code?: unknown; message?: unknown };
  const parts: string[] = [];
  if (typeof code === 'string' || typeof code === 'number') parts.push(`[${code}]`);
  if (typeof message === 'string') parts.push(message);
  return parts.length > 0 ? parts.join(' ') : 'unknown error';
}

/**
 * Drop the Coach's cards and its last answer: they were about the account
 * that was signed in (security review, 2026-11-18). Lazy, because coachStore
 * → analytics/track → authStore would be a fourth require cycle at module
 * load (docs/tooling-notes.md). Never throws.
 */
function resetCoach(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useCoachStore } = require('./coachStore') as typeof import('./coachStore');
    useCoachStore.getState().reset();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not clear the Coach:', errorForLog(e));
  }
}

/**
 * Delete the copies this app leaves in the phone's cache folders: CSV exports
 * (every title and reflection), share-card images, and the icon picker's
 * pictures (security review, 2026-11-18). For Erase, sign-out and account
 * deletion. Not awaited: no wipe waits on the file system, and each sweep
 * swallows its own errors. Lazy, so the native image modules load only when
 * used.
 */
function sweepCachedCopies(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepExportFiles } = require('@/export/file') as typeof import('@/export/file');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepShareCaptures } = require('@/share/export') as typeof import('@/share/export');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepIconImageFiles } = require('@/media/iconImage') as typeof import('@/media/iconImage');
    for (const sweep of [sweepExportFiles, sweepShareCaptures, sweepIconImageFiles]) {
      void sweep().catch(() => {});
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not sweep the cache:', errorForLog(e));
  }
}

/**
 * What `eraseAccountHere` takes.
 *
 *   'accountRows': the account's rows only (`deviceData: false`). The
 *   Warm-up, the age band and practice belong to this phone, not to the
 *   account, and stay (main session, 2026-11-19). For sign-out (D69 (a)) and
 *   for every owed wipe: a sign-out's that didn't finish, and an unconfirmed
 *   deletion's once its session has ended.
 *   'confirmedDeletion': a confirmed deletion's local half (ACCOUNT_SPEC
 *   §3.4), as before: the card's left-off categories, the streak moment
 *   day and when the line about usage counts was shown (D69 (b)), the
 *   account's rows, the Warm-up and the age band (the wipe's
 *   default), then the Warm-up and practice stores.
 */
type EraseKind = 'accountRows' | 'confirmedDeletion';

/**
 * Take an account's rows off this phone. Never throws; returns whether the
 * rows are gone.
 *
 * Its sync is stopped first and waited for, so no pulled row or recompute
 * lands after the wipe. The sync cursor is cleared and the cached copies
 * swept whether or not the wipe went through.
 */
async function eraseAccountHere(userId: string, kind: EraseKind): Promise<boolean> {
  if (kind === 'confirmedDeletion') {
    try {
      // The categories left off the card were about the erased record: any
      // can be left off now, so a kept choice could empty a new card (code
      // review, 2026-11-14). And the day a streak checkpoint's moment played
      // (step 194). And that the line about usage counts was shown (D69 (b)):
      // the Warm-up that showed it goes below, so it is shown again before a
      // guest's counts go up.
      await useSettingsStore.getState().setCardHiddenCategories([]);
      await useSettingsStore.getState().setStreakMomentDay(null);
      await useSettingsStore.getState().forgetUsageNoticeShown();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] could not reset the card settings:', errorForLog(e));
    }
  }
  await stopSyncFor(userId);
  let wiped = false;
  try {
    // A confirmed deletion's wipe is the call it always was (device data
    // included, the default); every other leaves the Warm-up and the age band.
    if (kind === 'confirmedDeletion') await wipeLocalUserData(userId);
    else await wipeLocalUserData(userId, { deviceData: false });
    wiped = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] local wipe failed:', errorForLog(e));
  }
  if (kind === 'confirmedDeletion') {
    try {
      // The Warmup's rows went with the wipe; its store forgets them too.
      // Practice belongs to the device like the Warmup, and the privacy
      // policy promises this phone's copy is gone (owner, 2026-11-09).
      await useWarmupStore.getState().retake();
      await usePracticeStore.getState().clear();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] could not reset the Warm-up or practice:', errorForLog(e));
    }
  }
  // Whether or not the wipe went: the per-user sync cursor (ACCOUNT_SPEC
  // §3.4; without it a later sign-in would pull only what changed since) and
  // the copies in the cache.
  await clearSyncCursor(userId);
  sweepCachedCopies();
  return wiped;
}

/**
 * Reload the predictions and stats stores for the newly-active user. Called
 * on every userId transition (including guest mode) so screens reflect the
 * right account immediately.
 */
async function reloadForUser(userId: string): Promise<void> {
  await Promise.all([
    // The person's own category names (roadmap D39).
    useCategoryStore.getState().load(),
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

/** Who the app is with no session: the device-local guest. */
const GUEST_STATE = {
  userId: LOCAL_GUEST_USER_ID,
  email: null,
  status: 'guest',
  hasAppleIdentity: false,
  hasGoogleIdentity: false,
} as const;

/**
 * Compute the new auth state from a session. Pure — testable without touching
 * the store.
 */
function sessionToState(session: Session | null): {
  userId: string;
  email: string | null;
  status: AuthStatus;
  hasAppleIdentity: boolean;
  hasGoogleIdentity: boolean;
} {
  if (!session?.user) {
    return { ...GUEST_STATE };
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    status: 'authenticated',
    hasAppleIdentity: auth.hasAppleIdentity(session.user),
    hasGoogleIdentity: auth.hasGoogleIdentity(session.user),
  };
}

/**
 * Move the app to the session an auth event (or the app's own sign-out,
 * `APP_SIGN_OUT`) reports.
 *
 * A session for an account this phone signed out of alone, arriving any way
 * but a sign-in the person started, is a token refresh that landed after the
 * sign-out and wrote it back (client reviewer LOW-A): ignored, and taken off
 * the phone again. Only a SIGNED_IN during a sign-in the person started moves
 * the guest's rows into an account.
 */
async function handleSession(
  event: string,
  session: Session | null,
  set: (s: Partial<AuthState>) => void,
): Promise<void> {
  const next = sessionToState(session);
  const prevUserId = lastUserId;
  // Decided before any await: the sign-in that started it is still running.
  const personStarted =
    event === 'SIGNED_IN' && signInsInFlight > 0 && next.status === 'authenticated';

  if (
    next.status === 'authenticated' &&
    !personStarted &&
    next.userId !== prevUserId &&
    markers.isSignedOutHere(next.userId)
  ) {
    await auth.discardStoredSession();
    // Its write replaced the stored session of the account the app shows, if
    // any: that one is gone from the phone too, so the app follows.
    if (prevUserId !== null && prevUserId !== LOCAL_GUEST_USER_ID) {
      await handleSession('SIGNED_OUT', null, set);
    }
    return;
  }

  lastUserId = next.userId;

  // Another account, or none: the Coach's cards go before the new state
  // shows, so one account's never draw under the next one's.
  if (prevUserId !== next.userId) resetCoach();

  if (next.status === 'authenticated' && prevUserId !== next.userId) {
    resumeSyncFor(next.userId);
  }

  if (personStarted) {
    // The person signed in to this account: its sessions count again, its
    // rows are live (no wipe owed), and the first sync pulls everything, so
    // rows a sign-out took off the phone come back even if clearing the
    // cursor then failed.
    await markers.forgetSignedOutHere(next.userId);
    await markers.settleOwedWipe(next.userId);
    await clearSyncCursor(next.userId);
  }

  // Guest→authenticated transition, on a sign-in the person started: move
  // local rows over to the real id before reloading the stores, so the
  // reload sees the merged data.
  if (
    personStarted &&
    prevUserId === LOCAL_GUEST_USER_ID &&
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
      console.warn('[auth] guest data migration failed:', errorForLog(e));
    }
  }

  set(next);

  // Leaving an account whose rows are owed a wipe: its deletion was asked
  // for and not confirmed, and its session has now ended by itself (the
  // account is likely gone, so a token refresh failed). The app's own
  // sign-out and deletion wipe themselves, before this.
  if (
    event !== APP_SIGN_OUT &&
    prevUserId !== null &&
    prevUserId !== LOCAL_GUEST_USER_ID &&
    prevUserId !== next.userId &&
    !wipesInHand.has(prevUserId)
  ) {
    if (
      markers.owedWipeFor(prevUserId) !== null &&
      (await eraseAccountHere(prevUserId, 'accountRows'))
    ) {
      await markers.settleOwedWipe(prevUserId);
    }
  }

  // Only reload stores if the user actually changed. Token refresh events
  // also fire onAuthStateChange but keep the same userId.
  if (prevUserId !== next.userId) {
    // Leaving an account (sign-out, or another account): its half-typed Log
    // draft is that person's words, not the next one's (step 173; code review
    // 2026-11-12). A guest signing in keeps it, as their predictions go along.
    if (prevUserId && prevUserId !== LOCAL_GUEST_USER_ID) {
      // And reminders on the lock screen showing its words go too, however
      // the session ended: a sign-out, or one that expired (security review,
      // 2026-11-18). Not awaited, and never throws.
      void dismissDeliveredReminderWords().catch(() => {});
      await useLogDraftStore.getState().clear();
      useResolveRunStore.getState().clear();
    }
    try {
      await reloadForUser(next.userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] post-signin store reload failed:', errorForLog(e));
    }
  }

  // Fire-and-forget Supabase sync for authenticated users. syncNow no-ops
  // for guests, no-ops when Supabase isn't configured, and swallows its own
  // errors — auth init must not block on network.
  if (next.status === 'authenticated') {
    void syncForUser(next.userId);
  }
}

function holdPending(set: (s: Partial<AuthState>) => void): void {
  pendingHolds += 1;
  set({ pending: true });
}

function releasePending(set: (s: Partial<AuthState>) => void): void {
  pendingHolds = Math.max(0, pendingHolds - 1);
  if (pendingHolds === 0) set({ pending: false });
}

/**
 * Run one account action with `pending` held for its duration, and after it
 * while a sign-out the Supabase client is still running after this phone
 * ended the session alone hasn't settled (at most 60 s; client reviewer
 * LOW-B): that call reads whatever session is stored when it runs, so a
 * sign-in underneath it would be signed out at once.
 */
async function withPending<T>(
  set: (s: Partial<AuthState>) => void,
  action: () => Promise<T>,
): Promise<T> {
  holdPending(set);
  try {
    return await action();
  } finally {
    if (auth.signOutStillSettling()) {
      holdPending(set);
      void (async () => {
        try {
          await auth.whenSignOutSettles();
        } finally {
          releasePending(set);
        }
      })();
    }
    releasePending(set);
  }
}

/**
 * A sign-in the person started: a SIGNED_IN while it runs may move the
 * guest's rows into the account. Waits first for a sign-out the client is
 * still running (see withPending), which screens already wait out through
 * `pending`. With none, the sign-in starts at once.
 */
async function asPersonSignIn<T>(signIn: () => Promise<T>): Promise<T> {
  if (auth.signOutStillSettling()) await auth.whenSignOutSettles();
  signInsInFlight += 1;
  try {
    return await signIn();
  } finally {
    signInsInFlight -= 1;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  email: null,
  status: 'loading',
  hasAppleIdentity: false,
  hasGoogleIdentity: false,
  accountsAvailable: false,
  pending: false,

  initialize: async () => {
    if (didInitialize) return;
    didInitialize = true;

    if (!isSupabaseConfigured()) {
      // Pure offline mode — no Supabase wiring, just the guest placeholder.
      lastUserId = LOCAL_GUEST_USER_ID;
      set({ ...GUEST_STATE });
      return;
    }

    let client: SupabaseClient;
    try {
      client = getSupabaseClient();
    } catch (e) {
      // Shouldn't happen given isSupabaseConfigured passed, but if it does,
      // degrade gracefully to guest mode so the offline loop still works.
      // eslint-disable-next-line no-console
      console.warn('[auth] Supabase client unavailable, running as guest:', errorForLog(e));
      lastUserId = LOCAL_GUEST_USER_ID;
      set({ ...GUEST_STATE });
      return;
    }

    set({ accountsAvailable: true });

    // Which accounts this phone signed out of alone, and whose rows are
    // owed a wipe, as the last run left them.
    await markers.loadAuthMarkers();

    // Read whatever session storage already has (warm start), then
    // subscribe to future changes.
    const { data } = await client.auth.getSession();
    let session = data.session;
    // A session this phone signed out of alone, written back by a token
    // refresh that landed late and kept by a restart before it was taken off
    // again: it doesn't count.
    if (session?.user && markers.isSignedOutHere(session.user.id)) {
      await auth.discardStoredSession();
      session = null;
    }
    // Rows owed a wipe, for every account not signed in now: a sign-out whose
    // wipe didn't finish, or a deletion asked for whose session has since
    // ended.
    const current = session?.user?.id ?? null;
    for (const { userId, reason } of markers.owedWipes()) {
      if (userId === current) {
        // Still signed in to it: a sign-out that marked it never ended the
        // session (the app was closed first), so the account and its rows
        // are the person's again, new ones included. An unconfirmed
        // deletion's mark stays until the session ends.
        if (reason === 'signOut') await markers.settleOwedWipe(userId);
        continue;
      }
      if (await eraseAccountHere(userId, 'accountRows')) await markers.settleOwedWipe(userId);
    }
    await handleSession('INITIAL_SESSION', session, set);

    const { data: sub } = client.auth.onAuthStateChange((event, changed) => {
      void handleSession(event, changed, set).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[auth] could not follow a session change:', errorForLog(e));
      });
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
    signInsInFlight = 0;
    pendingHolds = 0;
    wipesInHand.clear();
    markers.__resetAuthMarkersForTests();
    set({
      userId: null,
      email: null,
      status: 'loading',
      hasAppleIdentity: false,
      hasGoogleIdentity: false,
      accountsAvailable: false,
      pending: false,
    });
  },

  signInWithEmail: (email, password) =>
    withPending(set, () => asPersonSignIn(() => auth.signInWithEmail(email, password))),
  signUpWithEmail: (email, password) =>
    withPending(set, () => asPersonSignIn(() => auth.signUpWithEmail(email, password))),
  signInWithApple: () => withPending(set, () => asPersonSignIn(() => auth.signInWithApple())),
  signInWithGoogle: () => withPending(set, () => asPersonSignIn(() => auth.signInWithGoogle())),

  signOut: (opts) =>
    withPending(set, async (): Promise<SignOutOutcome> => {
      const { status, userId } = get();
      const account =
        status === 'authenticated' && userId && userId !== LOCAL_GUEST_USER_ID ? userId : null;

      let addedOwed = false;
      if (account) {
        // 1. One more push, so as little as possible is left unsynced.
        await pushNow(account);
        // 2. What signing out would lose. Unless the person has already said
        // to discard it, anything left means nothing happens yet.
        if (!opts?.discardUnsynced) {
          let unsynced: number;
          try {
            unsynced = await countUnsynced(account);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[auth] could not count what is unsynced:', errorForLog(e));
            return { ok: false, error: SIGN_OUT_CHECK_FAILED };
          }
          if (unsynced > 0) return { ok: false, unsynced };
        }
        // 3. Its rows are owed a wipe from here (retried at the next launch if
        // it doesn't finish), and its sync stops, the running sweep waited for.
        addedOwed = await markers.addOwedWipe(account, 'signOut');
        await stopSyncFor(account);
        wipesInHand.add(account);
      }

      try {
        // 4. End the session: online, or on this phone alone (`localOnly`).
        let outcome: SessionEndOutcome;
        try {
          outcome = await auth.signOut();
        } catch (e) {
          if (account) await keepAccount(account, addedOwed);
          throw e;
        }
        if (!outcome.ok) {
          // Still signed in: the account and its rows stay, and it syncs again.
          if (account) await keepAccount(account, addedOwed);
          // The words still leave the lock screen: the person asked to leave.
          void dismissDeliveredReminderWords().catch(() => {});
          return outcome;
        }

        if (account) {
          // A token refresh under way can still write this session back:
          // it is ignored when it lands (handleSession).
          if (outcome.localOnly) await markers.rememberSignedOutHere(account);
          // 5. The account's rows leave the phone (the Warm-up, the age band
          // and practice stay), and with them any wipe owed for it, a
          // deletion's included.
          if (await eraseAccountHere(account, 'accountRows')) {
            await markers.settleOwedWipe(account);
          }
        }

        // 6. Everything a sign-out did before. Supabase has usually moved the
        // app already (SIGNED_OUT, then handleSession); when only this phone
        // could end it, nothing did. Either way the app follows now: billing
        // logs out and drops to free, reminders still to come are cancelled
        // with the reload, the Log draft and the answer run are cleared.
        // handleSession does nothing twice for the same id.
        try {
          await handleSession(APP_SIGN_OUT, null, set);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[auth] moving to the guest after sign-out failed:', errorForLog(e));
        }
        // Reminders on the lock screen showing a prediction's words go.
        void dismissDeliveredReminderWords().catch(() => {});
        return outcome;
      } finally {
        if (account) wipesInHand.delete(account);
      }
    }),

  deleteAccount: () =>
    withPending(set, async (): Promise<DeleteAccountResult> => {
      const { status, userId, hasAppleIdentity } = get();
      if (status !== 'authenticated' || !userId) {
        return { ok: false, error: 'Not signed in.' };
      }

      // Any account with a Sign in with Apple identity, an email account
      // linked to Apple included: its grant is revoked too. Null if declined
      // or unavailable; the server then skips revocation.
      const appleCode = hasAppleIdentity ? await auth.reauthenticateWithApple() : null;

      // Before the call (client reviewer, HIGH 2): if the account is deleted
      // without this phone hearing, its rows still leave the phone when its
      // session ends by itself.
      const addedOwed = await markers.addOwedWipe(userId, 'deletion');
      // Sent only if the session is this account's (src/supabase/account.ts).
      const outcome = await deleteAccountOnServer(appleCode, { expectedUserId: userId });
      if (!outcome.ok) {
        // Nothing was deleted, for certain: the mark goes, unless an earlier
        // attempt that couldn't be confirmed set it.
        if (outcome.error === DELETE_FAILED_MESSAGE && addedOwed) {
          await markers.settleOwedWipe(userId);
        }
        return outcome;
      }

      // Whether the person removes the app from Sign in with Apple themselves
      // (ACCOUNT_SPEC §3.2 step 5; security review, 2026-11-18, round 4). Any
      // account with an Apple identity whose revoke the server didn't confirm:
      // the sheet was cancelled so no code went, the server skipped it (a
      // different Apple ID, no key) or it failed or timed out, or the deletion
      // was confirmed by the "already deleted" check, which says nothing about
      // Apple. Unsure reads as not revoked: the line is harmless if it was.
      const appleNotRevoked = hasAppleIdentity && !outcome.appleRevoked;

      // The account is gone: the function said so, or the auth server said
      // afterwards that the user no longer exists (src/supabase/account.ts).
      // From here nothing may report failure — the
      // user's request has been carried out, and "try again" would hit a
      // deleted account. A local step that fails is logged and passed over;
      // a wipe that fails stays owed and is tried again at the next launch.
      wipesInHand.add(userId);
      try {
        // The Coach's cards first: they were about the account.
        resetCoach();
        const wiped = await eraseAccountHere(userId, 'confirmedDeletion');
        try {
          await useLogDraftStore.getState().clear();
          useResolveRunStore.getState().clear();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[auth] could not clear the draft or the answer run:', errorForLog(e));
        }
        if (wiped) await markers.settleOwedWipe(userId);
        // Local, not global: every server session died with the user. The
        // server answers it with a 401 or 403, which supabase-js takes as
        // signed out; with no connection the session is removed here alone
        // (src/supabase/auth.ts). Then the app follows: an empty guest, and
        // billing logs out and drops Plus.
        const signedOut = await auth.signOutLocal();
        if (signedOut.ok) {
          try {
            await handleSession(APP_SIGN_OUT, null, set);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[auth] moving to the guest after deletion failed:', errorForLog(e));
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn('[auth] local sign-out after account deletion failed:', signedOut.error);
        }
        // What's already on the lock screen was about the account that's gone.
        // Last and not awaited: the wipe and the sign-out never wait on the lock
        // screen, and it never throws (code review, 2026-11-15).
        void dismissDeliveredNotifications().catch(() => {});
      } finally {
        wipesInHand.delete(userId);
      }
      return { ok: true, appleNotRevoked };
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
        // Log's kept draft is the person's own words (step 173).
        await useLogDraftStore.getState().clear();
        useResolveRunStore.getState().clear();
        // As after account deletion: the choice was about the erased record,
        // and so was the day a streak checkpoint's moment played (step 194).
        // A fresh start shows the line about usage counts again, with the
        // Warm-up, before anything goes up (D69 (b)).
        await useSettingsStore.getState().setCardHiddenCategories([]);
        await useSettingsStore.getState().setStreakMomentDay(null);
        await useSettingsStore.getState().forgetUsageNoticeShown();
        await reloadForUser(LOCAL_GUEST_USER_ID);
        // And what's already on the lock screen was about it too. After the
        // reload, which cancels the reminders still to come, and not awaited:
        // Erase never waits on the lock screen (code review, 2026-11-15).
        void dismissDeliveredNotifications().catch(() => {});
        // So were the copies in the cache folders, and anything the Coach
        // still showed. Neither is waited on.
        sweepCachedCopies();
        resetCoach();
        return { ok: true };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[auth] erase failed:', errorForLog(e));
        return { ok: false, error: "Couldn't finish erasing your data. Try again." };
      }
    }),
}));

/**
 * The session didn't end after all: the account stays signed in with its
 * rows, so it syncs again, and the wipe this sign-out marked as owed is
 * dropped (one a deletion marked earlier stays).
 */
async function keepAccount(userId: string, addedOwed: boolean): Promise<void> {
  resumeSyncFor(userId);
  if (addedOwed) await markers.settleOwedWipe(userId);
}

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
// 2026-11-19, D69 (a)): one more push, then, if anything would be lost for
// good (changes not yet on the server, categories only this phone has) and
// the person hasn't agreed to lose it, nothing happens and the screen asks;
// otherwise the rows go, checked once more just before, and the session
// ends. The guest's Warm-up and practice stay, and so do this phone's
// integrity counts (round 6).
//
// The under-13 rule (roadmap D70, 2026-11-19): while the age store says the
// phone is local-only (`isLocalOnly`, ./ageStore), every sign-in and sign-up
// action refuses with `LOCAL_ONLY_SIGN_IN` before any service is called (and
// with `auth.AGE_PENDING_SIGN_IN` while Apple's answer is still pending after
// its 5 s wait), and `syncForUser` sends nothing. An account already signed
// in is frozen, not signed out: Sign out and Delete account work as built
// (deletion is the one upload left open, since it removes data; a sign-out
// that fails after its wipe says backup is off,
// `SIGN_OUT_FAILED_AFTER_WIPE_LOCAL_ONLY`). Guest Erase and a confirmed
// deletion clear the stored band, and the gate stays on for the run
// (`forgetBand`). Stopping the session's refresh and the rest of entering or
// leaving the rule are src/age/localOnly.ts's.
//
// Guest Erase removes everything on the phone, whoever's it was (main
// session, 2026-11-19): every per-user row under every account id, the
// device data with it (`wipeEverythingOnDevice`). Account deletion and
// sign-out stay scoped to one account (`wipeLocalUserData`).
//
// A launch with no connection opens as the account signed in here (release
// gate review, 2026-11-20). The client's read of the stored session refreshes
// one near expiry, and with no connection retries for about 25 s, twice: the
// launch page stayed up for up to 50 s, then the app opened as the guest, its
// reminders cancelled and anything logged filed under the guest. Launch now
// waits at most `LAUNCH_SESSION_WAIT_MS` for that read; past it, or when it
// says the server couldn't be reached, the account comes from the session
// record on this phone (`launchSession`), and the read's late answer is
// followed (`followLateLaunchRead`). A session the server refused still signs
// the phone out, as before.
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

import { wipeEverythingOnDevice, wipeLocalUserData } from '@/db/account';
import {
  LOCAL_GUEST_USER_ID,
  migrateGuestDataToUser,
} from '@/db/migrateGuestData';
import { countUnsyncedForAccounts } from '@/db/predictions';
import {
  dismissDeliveredNotifications,
  dismissDeliveredReminderWords,
} from '@/notifications/scheduler';
import {
  DELETE_FAILED_MESSAGE,
  deleteAccountOnServer,
  deletionCanNoLongerLand,
} from '@/supabase/account';
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
  agreedCovers,
  NOTHING_AT_STAKE,
  readAtStake,
  type AtStake,
} from '@/supabase/signOutCheck';
import {
  clearSyncCursor,
  pushNow,
  resumeSyncFor,
  stopSyncFor,
  syncNow,
} from '@/supabase/sync';

import {
  AGE_ANSWER_WAIT_MS,
  isLocalOnly,
  LOCAL_ONLY_SIGN_IN as AGE_RANGE_REFUSAL,
  useAgeStore,
  whenAgeSettled,
} from './ageStore';
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
   * The person has been told what signing out would lose (`{ ok: false,
   * unsynced, localCategories }`: changes that haven't reached the server,
   * categories only this phone has) and chose to sign out anyway: those go
   * with the account's rows. It covers what they were told and nothing more:
   * anything new by the time of the wipe, or since they were asked, stops the
   * sign-out and they are asked again (round 6, N2). With no question asked
   * for the account in this run, it agrees to nothing: anything at stake is
   * asked about first (round 7, client re-review L1; it used to agree to
   * whatever was there when the call counted).
   */
  discardUnsynced?: boolean;
}

/**
 * Sign-out couldn't count what this phone holds that the server doesn't, so
 * it can't say what signing out would lose: nothing was changed.
 */
export const SIGN_OUT_CHECK_FAILED =
  "Couldn't check whether everything on this phone is backed up, so you're still signed in. Try again.";

/**
 * The account's rows left this phone, but even this phone's copy of the
 * session couldn't be removed (round 7, client re-review L3): still signed
 * in. What the server has comes back with the sync that starts at once (the
 * wipe cleared the cursor, so it pulls everything), or at the next one with a
 * connection. What the person agreed to lose (changes the server didn't have,
 * categories only this phone had) went with the wipe and doesn't come back;
 * with nothing at stake they agreed to nothing, and nothing is lost. Only for
 * a session's end that failed after the wipe went: one that failed with the
 * rows still here returns the session's own error.
 */
export const SIGN_OUT_FAILED_AFTER_WIPE =
  "Couldn't finish signing you out, so you're still signed in. Your backed-up predictions will come back to this phone; anything you agreed to lose is gone.";

/**
 * `SIGN_OUT_FAILED_AFTER_WIPE` for a frozen account (roadmap D70): the
 * under-13 rule applies when the error is returned, so no sync runs and the
 * backed-up predictions don't come back while it does. They stay on the
 * server, and come back with the first sync once the rule no longer applies.
 * Names no age.
 */
export const SIGN_OUT_FAILED_AFTER_WIPE_LOCAL_ONLY =
  "Couldn't finish signing you out, so you're still signed in. Backup is off on this phone, so your backed-up predictions stay on our server for now; anything you agreed to lose is gone.";

/**
 * What every sign-in and sign-up returns while the under-13 rule applies
 * (roadmap D70): "Accounts are off on this phone because of the age range it
 * shares with Fairly Sure." Defined in the age store, a leaf, so the auth
 * service can use the same words without a require cycle. A plain constant,
 * not an `export { … } from` re-export: that compiles to a getter, which a
 * test spreading this module part-way through a require cycle would call
 * before ./ageStore is assigned.
 */
export const LOCAL_ONLY_SIGN_IN: string = AGE_RANGE_REFUSAL;

/**
 * Erase didn't finish: the wipe failed (one transaction, so nothing was
 * removed) or a step after it did, or a sign-in was under way.
 */
const ERASE_FAILED = "Couldn't finish erasing your data. Try again.";

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
   * 1. One more push. 2. What signing out would lose for good: changes not
   * on the server and categories only this phone has. Anything the person
   * hasn't agreed to lose (`discardUnsynced` covers only what they were told):
   * `{ ok: false, unsynced, localCategories }`, and nothing changes (still
   * signed in, every row here). 3. The account's sync stops, and the same is
   * read again: anything new since stops the sign-out the same way, the
   * account kept as it was (round 6, N2). 4. The account's rows are wiped
   * (its predictions, stats and categories; not this phone's integrity counts,
   * the Warm-up, the age band or practice), its sync cursor cleared and the
   * cached copies swept. 5. The session ends, online or on this
   * phone alone as before (`localOnly`), and the account is remembered as
   * signed out here, so a stale copy of its session coming back is ignored.
   * 6. Then
   * everything a sign-out did before: the guest, billing logged out and
   * dropped to free, reminders still to come cancelled with the reload,
   * reminders showing words dismissed, the Coach, the Log draft and the
   * answer run cleared.
   *
   * `{ ok: false, error }` when the session couldn't be ended even on this
   * phone (still signed in; reminders showing words still leave the lock
   * screen): `SIGN_OUT_FAILED_AFTER_WIPE` when the rows had already gone in
   * step 4 (what the server has comes back with the sync, which is started;
   * what the person agreed to lose is gone), or, under the under-13 rule,
   * `SIGN_OUT_FAILED_AFTER_WIPE_LOCAL_ONLY` (backup is off, so it stays on the
   * server while the rule applies), else the session's own error
   * (nothing removed). Or when what would be lost couldn't be read
   * (`SIGN_OUT_CHECK_FAILED`; nothing changed). A wipe that fails before the
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
   * device, whoever's it was (main session, 2026-11-19): every per-user row
   * under every account id (the guest's, and any an account left here, its
   * integrity counts and sync markers included), the age band, the Warm-up
   * and practice (`wipeEverythingOnDevice`); then wipes owed for any account
   * are settled and every account's sync cursor cleared, the Log draft, the
   * answer run, the card and streak-moment choices and the usage line's stamp
   * forgotten, the stores reloaded, the lock screen and the cache cleared and
   * the Coach dropped. The "signed out here" list stays (ids only; it keeps a
   * stale session from coming back), and so do the entitlement mirror and the
   * settings. Nothing to call — it never left the phone. Refused while a
   * sign-in is under way.
   *
   * The Log draft (the person's words) goes before the wipe; every step after
   * it runs in its own try, so one that throws can't leave the others undone
   * (review, 2026-11-19). `{ ok: false }` when the wipe failed (nothing
   * removed; nothing after it runs) or any other step did (the rest ran).
   * Safe to run again: every step is.
   */
  eraseDeviceData: () => Promise<AuthOutcome>;
  /**
   * For Erase's confirmation, awaited just before it asks and never cached
   * (record audit, 2026-11-19): how many changes accounts made on this phone
   * never reached the server (`countUnsyncedForAccounts`: dirty prediction
   * rows and deletions not yet pushed, under every account id but the
   * guest's). Erase removes them with everything else, and they can't come
   * back. Null when the count couldn't be read. Never throws.
   */
  countUnsyncedAccountChanges: () => Promise<number | null>;
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
/**
 * What the last sign-out question in this run told the person signing out
 * would lose, and for which account: what `discardUnsynced` agrees to lose
 * (round 6, N2). Forgotten when the app leaves the account.
 */
let askedAbout: { account: string; atStake: AtStake } | null = null;
/**
 * The account launch opened from the session record on this phone
 * (`launchSession`), until the client shows it holds that session (an event
 * carrying it, or the late answer to launch's read) or the app leaves the
 * account. While it is set, the client's own INITIAL_SESSION with no session
 * is a refresh that couldn't reach the server, not an end (the subscription in
 * `initialize`).
 */
let openedFromStorage: string | null = null;

/** The event handleSession gets when the app's own sign-out or deletion ends a session. */
const APP_SIGN_OUT = 'APP_SIGN_OUT';

/**
 * How long launch waits for the client's read of the stored session before
 * opening as the account whose session is stored on this phone (the offline
 * launch, 2026-11-20). auth-js 2.106.2 refreshes a stored session within 90 s
 * of expiry inside that read (GoTrueClient `__loadSession`), and access tokens
 * last an hour, so most cold starts refresh; with no connection each refresh
 * retries for about 25 s (`_refreshAccessToken`). Online, a valid session
 * answers at once and an expiring one in a round trip.
 */
export const LAUNCH_SESSION_WAIT_MS = 2_000;

/** What `client.auth.getSession()` resolves to. */
type SessionRead = Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;

/** A session as the app follows it: only its user is read (`sessionToState`). */
type SessionLike = Pick<Session, 'user'>;

/** What `withinMs` resolves to when the promise hasn't settled in time. */
const NO_ANSWER: unique symbol = Symbol('no answer');

/**
 * `promise`'s value, or `NO_ANSWER` when it hasn't settled within `ms`. The
 * pattern of `withTimeout` in src/supabase/auth.ts, except that running out
 * of time resolves rather than rejects, so the caller keeps the promise and
 * can follow its late answer. Rejects when `promise` rejects in time.
 */
function withinMs<T>(promise: Promise<T>, ms: number): Promise<T | typeof NO_ANSWER> {
  return new Promise<T | typeof NO_ANSWER>((resolve, reject) => {
    const timer = setTimeout(() => resolve(NO_ANSWER), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** What launch opens as (`launchSession`). */
interface LaunchSession {
  /** The session, or the stored session's user, launch opens as; null for none. */
  session: SessionLike | null;
  /** True when `session` came from the record on this phone, not the client's answer. */
  fromStorage: boolean;
  /** The client's read, which keeps running after a timeout: its late answer is followed. */
  read: Promise<SessionRead>;
}

/**
 * The session launch opens as (the offline launch, 2026-11-20).
 *
 * The client's own answer when it comes within `LAUNCH_SESSION_WAIT_MS`: a
 * session (valid, or refreshed in time), or none with no error (nothing
 * stored) or with any error but a retryable one (the server refused the
 * session, and auth-js has removed it): the guest, as before.
 *
 * The session record on this phone instead, read without the server
 * (`auth.readStoredSessionUser`), when the client hasn't answered in time,
 * answered with auth-js's retryable fetch error (it couldn't reach the server
 * and kept the session), or threw: the account still signed in here, which
 * is what the client would answer with a connection. No record, or none
 * auth-js could use: the guest, as before.
 *
 * The read is the one request launch always made (src/age/egress.test.ts
 * pins it); the record is read from the phone's own storage. Never rejects.
 */
async function launchSession(client: SupabaseClient): Promise<LaunchSession> {
  const read = client.auth.getSession();
  let answer: SessionRead | typeof NO_ANSWER;
  try {
    answer = await withinMs(read, LAUNCH_SESSION_WAIT_MS);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not read the session at launch:', errorForLog(e));
    answer = NO_ANSWER;
  }
  if (answer !== NO_ANSWER) {
    const session = answer.data?.session ?? null;
    if (session || !answer.error || !auth.isRetryableAuthError(answer.error)) {
      return { session, fromStorage: false, read };
    }
  }
  const user = await auth.readStoredSessionUser(client);
  return { session: user ? { user } : null, fromStorage: user !== null, read };
}

/**
 * Follow the late answer to launch's read of the session, after launch opened
 * `userId` from the record on this phone (`launchSession`). Only while the app
 * is still that account, unconfirmed: an event that came first has already
 * moved it on (handleSession). Never rejects.
 *
 *   - That account's session: the refresh landed. auth-js sent
 *     TOKEN_REFRESHED, which handleSession takes as the same account: no
 *     reload, and no guest rows moved, since only a SIGNED_IN during a
 *     sign-in the person started moves them. Nothing is left to confirm.
 *   - No session, with auth-js's retryable fetch error: still no connection.
 *     The app stays the account; the client's refresh timer, or the next read
 *     of the session, tries again, and auth-js keeps the session meanwhile.
 *   - No session, with any other answer: the server refused the session
 *     (signed out elsewhere, the account deleted), or it is no longer stored.
 *     auth-js removed it and sent SIGNED_OUT (GoTrueClient
 *     `_callRefreshToken` → `_removeSession`) to the listeners it had then,
 *     which may have been before the subscription was made: the app signs
 *     out here, as that event would have done. Twice is harmless:
 *     handleSession does nothing twice for the same id.
 *   - A throw: nothing can be told from it, and the app stays the account.
 */
async function followLateLaunchRead(
  read: Promise<SessionRead>,
  userId: string,
  set: (s: Partial<AuthState>) => void,
): Promise<void> {
  let answer: SessionRead;
  try {
    answer = await read;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] the session read at launch failed:', errorForLog(e));
    return;
  }
  if (openedFromStorage !== userId) return;
  const session = answer.data?.session ?? null;
  if (session) {
    if (session.user?.id === userId) openedFromStorage = null;
    return;
  }
  if (auth.isRetryableAuthError(answer.error)) return;
  openedFromStorage = null;
  try {
    await handleSession('SIGNED_OUT', null, set);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not follow the session read at launch:', errorForLog(e));
  }
}

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
 * deletion. Resolves true only when every sweep found nothing left of what it
 * removes; a sweep that resolves false or rejects counts as not done (one
 * that resolves nothing, as an older test mock does, counts as done: the
 * convention `eraseStep` reads). Never rejects. Guest Erase awaits it as a
 * step, so a copy still there makes Erase say it couldn't finish and a retry
 * sweeps again (round two, 2026-11-19); sign-out and account deletion don't
 * wait on it (`eraseAccountHere`). Lazy, so the native image modules load
 * only when used.
 */
async function sweepCachedCopies(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepExportFiles } = require('@/export/file') as typeof import('@/export/file');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepShareCaptures } = require('@/share/export') as typeof import('@/share/export');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sweepIconImageFiles } = require('@/media/iconImage') as typeof import('@/media/iconImage');
    const done = await Promise.all(
      [sweepExportFiles, sweepShareCaptures, sweepIconImageFiles].map((sweep) =>
        sweep().then(
          (result: unknown) => result !== false,
          () => false,
        ),
      ),
    );
    return done.every(Boolean);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not sweep the cache:', errorForLog(e));
    return false;
  }
}

/**
 * What `eraseAccountHere` takes.
 *
 *   'signOut': the account's rows but this phone's integrity counts
 *   (`deviceData: false, keepIntegrityCounts: true`): the counted deletions,
 *   late changes and moved answers stay, so signing out and back in can't
 *   empty Insights' "Only this phone keeps this count" lines (main session,
 *   2026-11-19; round 6, N1). The Warm-up, the age band and practice belong
 *   to this phone, not to the account, and stay too. For sign-out (D69 (a))
 *   and for a sign-out's wipe that didn't finish, retried at launch.
 *   'accountRows': the account's rows, its integrity counts included
 *   (`deviceData: false`). For an unconfirmed deletion's owed wipe, once its
 *   session has ended by itself: the person asked for the account to be
 *   deleted, and it likely was. The Warm-up, the age band and practice stay.
 *   'confirmedDeletion': a confirmed deletion's local half (ACCOUNT_SPEC
 *   §3.4), as before: the card's left-off categories, the streak moment
 *   day and when the line about usage counts was shown (D69 (b)), the
 *   account's rows, the Warm-up and the age band (the wipe's
 *   default), then the age store's band (D70), the Warm-up and practice
 *   stores.
 */
type EraseKind = 'signOut' | 'accountRows' | 'confirmedDeletion';

/** The wipe an owed mark asks for: a sign-out's keeps the integrity counts. */
function eraseKindFor(reason: markers.WipeReason): EraseKind {
  return reason === 'signOut' ? 'signOut' : 'accountRows';
}

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
    // included, the default); every other leaves the Warm-up and the age band,
    // and a sign-out's also this phone's integrity counts.
    if (kind === 'confirmedDeletion') await wipeLocalUserData(userId);
    else if (kind === 'signOut') {
      await wipeLocalUserData(userId, { deviceData: false, keepIntegrityCounts: true });
    } else await wipeLocalUserData(userId, { deviceData: false });
    wiped = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] local wipe failed:', errorForLog(e));
  }
  if (kind === 'confirmedDeletion' && wiped) {
    // The stored age band went with the wipe (device data): the store forgets
    // it, and the under-13 gate, if on, stays on for the rest of the run
    // (D70, call 4); the next launch asks Apple again before anything goes.
    // A band an ask saved after the wipe is cleared again; never throws.
    await useAgeStore.getState().forgetBand();
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
  // Not waited on: no wipe here waits on the file system (guest Erase does).
  void sweepCachedCopies();
  return wiped;
}

/**
 * After a guest's Erase took every per-user row on the phone
 * (`wipeEverythingOnDevice`): what else was kept per account. Never throws;
 * false when something here threw, so Erase reports a step that didn't
 * finish (re-review round two, 2026-11-19).
 *
 *   - Every wipe still owed is done: its rows went with everything else.
 *     The "signed out here" list stays: it stops a stale copy of a signed-out
 *     account's session from coming back, and holds ids only.
 *   - The sync cursor of every account that had rows here, or was owed a
 *     wipe: a timestamp under its id, in AsyncStorage. Without one, a later
 *     sign-in pulls everything, as a person's sign-in does anyway.
 *
 * The marker and cursor helpers (src/supabase) swallow their own storage
 * errors and say nothing of them, so a write of theirs that fails isn't seen
 * here: what they hold is account ids and sync timestamps, never words.
 */
async function forgetAccountsAfterErase(owners: readonly string[]): Promise<boolean> {
  try {
    await markers.loadAuthMarkers();
    const owed = markers.owedWipes().map(({ userId }) => userId);
    for (const userId of owed) await markers.settleOwedWipe(userId);
    const accounts = new Set([...owners, ...owed]);
    accounts.delete(LOCAL_GUEST_USER_ID);
    for (const userId of accounts) await clearSyncCursor(userId);
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] could not clear what Erase leaves per account:', errorForLog(e));
    return false;
  }
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
  // The under-13 rule (D70): a frozen account sends nothing. syncNow checks it
  // too (src/supabase/sync.ts); this keeps the store's own syncs (a session
  // that arrives, a sign-out that didn't end) from even starting one.
  if (isLocalOnly()) return Promise.resolve({ pulled: 0, pushed: 0 });
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
function sessionToState(session: SessionLike | null): {
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
 *
 * At launch the session may be the stored session's user alone, when the
 * client couldn't answer (`launchSession`): only the user is read here.
 */
async function handleSession(
  event: string,
  session: SessionLike | null,
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
  // Leaving the account launch opened from storage: nothing of it is left to confirm.
  if (openedFromStorage !== null && next.userId !== openedFromStorage) openedFromStorage = null;

  // Another account, or none: the Coach's cards go before the new state
  // shows, so one account's never draw under the next one's. And what a
  // sign-out question told the person was about the account left.
  if (prevUserId !== next.userId) {
    resetCoach();
    askedAbout = null;
  }

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
    const reason = markers.owedWipeFor(prevUserId);
    if (reason !== null && (await eraseAccountHere(prevUserId, eraseKindFor(reason)))) {
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

/** A sign-in or sign-up refused under the under-13 rule, or while Apple's answer is pending. */
type LocalOnlyRefusal = { ok: false; error: string };

/**
 * Every sign-in and sign-up action goes through here (roadmap D70): with
 * `pending` held, it waits for Apple's age answer on a launch that asks (at
 * most `AGE_ANSWER_WAIT_MS`; at once anywhere else), and refuses before any
 * service or client is touched: with `LOCAL_ONLY_SIGN_IN` while the phone is
 * local-only, and with `auth.AGE_PENDING_SIGN_IN` ("Sign-in isn't ready yet.
 * Try again in a moment.") while the answer is still pending after the wait,
 * so no account goes ahead before the app knows (policy audit, 2026-11-19;
 * until then it went on after 5 s). Both checked again just before the
 * service is called, after any sign-out still settling has been waited out.
 * The services refuse on their own too (`refuseWhenLocalOnly`,
 * src/supabase/auth.ts). A launch that doesn't ask is settled from the start:
 * no wait, no refusal.
 */
function accountSignIn<T>(
  set: (s: Partial<AuthState>) => void,
  start: () => Promise<T>,
): Promise<T | LocalOnlyRefusal> {
  return withPending(set, async (): Promise<T | LocalOnlyRefusal> => {
    // Only while Apple is being asked: otherwise the sign-in starts in the
    // same tick as the tap, as it always has.
    if (!useAgeStore.getState().settled) await whenAgeSettled(AGE_ANSWER_WAIT_MS);
    if (isLocalOnly()) return { ok: false, error: LOCAL_ONLY_SIGN_IN };
    if (!useAgeStore.getState().settled) return { ok: false, error: auth.AGE_PENDING_SIGN_IN };
    return asPersonSignIn(async (): Promise<T | LocalOnlyRefusal> => {
      if (isLocalOnly()) return { ok: false, error: LOCAL_ONLY_SIGN_IN };
      if (!useAgeStore.getState().settled) return { ok: false, error: auth.AGE_PENDING_SIGN_IN };
      return start();
    });
  });
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
    // subscribe to future changes. The client gets `LAUNCH_SESSION_WAIT_MS`
    // to answer; with no answer by then, or one that says the server couldn't
    // be reached, the session record on this phone stands in for it
    // (`launchSession`), and everything below treats it as the client's.
    const launch = await launchSession(client);
    let session = launch.session;
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
      if (await eraseAccountHere(userId, eraseKindFor(reason))) {
        await markers.settleOwedWipe(userId);
      }
    }
    const storedUserId = launch.fromStorage && session ? session.user.id : null;
    openedFromStorage = storedUserId;
    await handleSession('INITIAL_SESSION', session, set);
    // Only once the account has been opened, so a late sign-out never races
    // its reload.
    if (storedUserId !== null) void followLateLaunchRead(launch.read, storedUserId, set);

    const { data: sub } = client.auth.onAuthStateChange((event, changed) => {
      if (openedFromStorage !== null) {
        if (changed?.user?.id === openedFromStorage) {
          // The client holds the account's session now: a refresh landed.
          openedFromStorage = null;
        } else if (event === 'INITIAL_SESSION' && changed === null) {
          // The client's own first read for this listener, which couldn't
          // refresh the session either: auth-js 2.106.2 sends INITIAL_SESSION
          // with no session when that read fails (`_emitInitialSession`), and
          // keeps the session when the failure is a retryable one. Every way
          // it removes a session sends SIGNED_OUT first (`_removeSession`), and
          // that ends the account below.
          return;
        }
      }
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
    askedAbout = null;
    openedFromStorage = null;
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

  // Every action named sign(In|Up)… goes through accountSignIn: a test lists
  // them off the store and checks each refuses under the under-13 rule
  // (authStore.localOnly.test.ts), so a new one can't miss the gate.
  signInWithEmail: (email, password) =>
    accountSignIn(set, () => auth.signInWithEmail(email, password)),
  signUpWithEmail: (email, password) =>
    accountSignIn(set, () => auth.signUpWithEmail(email, password)),
  signInWithApple: () => accountSignIn(set, () => auth.signInWithApple()),
  signInWithGoogle: () => accountSignIn(set, () => auth.signInWithGoogle()),

  signOut: (opts) =>
    withPending(set, async (): Promise<SignOutOutcome> => {
      const { status, userId } = get();
      const account =
        status === 'authenticated' && userId && userId !== LOCAL_GUEST_USER_ID ? userId : null;

      let addedOwed = false;
      let wiped = false;
      /** What the person agreed to lose: nothing, unless they were asked and said so. */
      let agreed: AtStake = NOTHING_AT_STAKE;
      if (account) {
        // 1. One more push, so as little as possible is left to lose.
        await pushNow(account);
        // 2. What signing out would lose for good (changes not on the server,
        // categories only this phone has), and whether the person agreed to
        // lose it: `discardUnsynced` agrees to what they were told when asked
        // in this run (N2), and with no question asked for this account, to
        // nothing (round 7, L1). Anything more, and nothing happens yet.
        let atStake: AtStake;
        try {
          atStake = await readAtStake(account);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[auth] could not count what signing out would lose:', errorForLog(e));
          return { ok: false, error: SIGN_OUT_CHECK_FAILED };
        }
        if (opts?.discardUnsynced && askedAbout?.account === account) {
          agreed = askedAbout.atStake;
        }
        if (!agreedCovers(agreed, atStake)) return askAbout(account, atStake);
        // What may go from here: what is still here of what was agreed.
        agreed = atStake;
        // 3. Its rows are owed a wipe from here (retried at the next launch if
        // the wipe doesn't go), and its sync stops, a running sweep or push
        // waited for.
        addedOwed = await markers.addOwedWipe(account, 'signOut');
        await stopSyncFor(account);
        wipesInHand.add(account);
      }

      try {
        let rememberedHere = false;
        if (account) {
          // 4. Once more, immediately before the wipe, while the account can
          // still be kept as it was (N2): a change made since the question or
          // since step 2 (a reminder's Happened, a log while "Signing out…"
          // showed) stops it here, and the person is asked again.
          let atStake: AtStake;
          try {
            atStake = await readAtStake(account);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[auth] could not count what signing out would lose:', errorForLog(e));
            await keepAccount(account, addedOwed, false);
            return { ok: false, error: SIGN_OUT_CHECK_FAILED };
          }
          if (!agreedCovers(agreed, atStake)) {
            await keepAccount(account, addedOwed, false);
            return askAbout(account, atStake);
          }
          // 5. The account's rows leave the phone, but its integrity counts
          // (round 6, N1); the Warm-up, the age band and practice stay too.
          // Before the session ends, so step 4 is the last moment anything
          // could be added unasked. A wipe that went settles the mark this
          // sign-out made (a deletion's waits for the session to end, below);
          // one that failed stays owed for the launch.
          wiped = await eraseAccountHere(account, 'signOut');
          if (wiped && addedOwed) await markers.settleOwedWipe(account);
          // Remembered as signed out here before the session ends (N3): a
          // token refresh under way can write the session back as the
          // sign-out lands, online or not, and it is ignored when it does
          // (handleSession, and at launch).
          if (!markers.isSignedOutHere(account)) {
            await markers.rememberSignedOutHere(account);
            rememberedHere = true;
          }
        }

        // 6. End the session: online, or on this phone alone (`localOnly`).
        let outcome: SessionEndOutcome;
        try {
          outcome = await auth.signOut();
        } catch (e) {
          if (account) {
            if (rememberedHere) await markers.forgetSignedOutHere(account);
            await keepAccount(account, addedOwed, wiped);
          }
          throw e;
        }
        if (!outcome.ok) {
          // Still signed in: the account stays and syncs again; rows the wipe
          // took come back from the server.
          if (account) {
            if (rememberedHere) await markers.forgetSignedOutHere(account);
            await keepAccount(account, addedOwed, wiped);
          }
          // The words still leave the lock screen: the person asked to leave.
          void dismissDeliveredReminderWords().catch(() => {});
          // The rows already went (round 7, L3): the error says so, not that
          // nothing changed. Under the under-13 rule, read now, after
          // `keepAccount` (whose sync it refused), backup is off and the
          // words say the predictions stay on the server.
          if (account && wiped) {
            // eslint-disable-next-line no-console
            console.warn('[auth] the session did not end after the wipe:', outcome.error);
            return {
              ok: false,
              error: isLocalOnly() ? SIGN_OUT_FAILED_AFTER_WIPE_LOCAL_ONLY : SIGN_OUT_FAILED_AFTER_WIPE,
            };
          }
          return outcome;
        }

        // The session ended and the rows went: nothing is owed for the
        // account any more, an unconfirmed deletion's mark included.
        if (account && wiped) await markers.settleOwedWipe(account);

        // 7. Everything a sign-out did before. Supabase has usually moved the
        // app already (SIGNED_OUT, then handleSession); when only this phone
        // could end it, nothing did. Either way the app follows now: billing
        // logs out and drops to free, reminders still to come are cancelled
        // with the reload, the Log draft and the answer run are cleared.
        // handleSession does nothing twice for the same id.
        askedAbout = null;
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

      // An earlier request that couldn't be confirmed, and when it was sent.
      const earlierDeletion = markers.owedWipeFor(userId) === 'deletion';
      const earlierAskedAt = markers.deletionAskedAt(userId);
      // Before the call (client reviewer, HIGH 2): if the account is deleted
      // without this phone hearing, its rows still leave the phone when its
      // session ends by itself. Stamped with now: this request may run on the
      // server until well after it.
      const addedOwed = await markers.addOwedWipe(userId, 'deletion');
      // Sent only if the session is this account's (src/supabase/account.ts).
      const outcome = await deleteAccountOnServer(appleCode, { expectedUserId: userId });
      if (!outcome.ok) {
        // Nothing was deleted by this request, for certain.
        if (outcome.error === DELETE_FAILED_MESSAGE) {
          if (addedOwed) {
            // No earlier request: the mark goes.
            await markers.settleOwedWipe(userId);
          } else if (earlierDeletion) {
            // An earlier request couldn't be confirmed. The auth server
            // saying the account still exists, asked after that request can
            // no longer delete anything, rules it out too (round 6, N4); else
            // the mark stays, with that request's time, the one that may
            // still run.
            if (
              outcome.stillExistsAt !== undefined &&
              deletionCanNoLongerLand(earlierAskedAt, outcome.stillExistsAt)
            ) {
              await markers.settleOwedWipe(userId);
            } else if (earlierAskedAt !== null) {
              await markers.restoreDeletionAskedAt(userId, earlierAskedAt);
            }
            // With no time for the earlier request (an older build marked
            // it), the one just stamped stays: that request was sent before
            // now, so it is a later bound, and a definite answer that much
            // later still settles the mark.
          }
        }
        return { ok: false, error: outcome.error };
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
      // A sign-in under way would land its account's rows in the middle of a
      // wipe that takes every account's: Erase waits for another try.
      if (signInsInFlight > 0) return { ok: false, error: ERASE_FAILED };

      // Log's kept draft is the person's own words (step 173), in
      // AsyncStorage, not the database: first, so nothing after can leave it
      // behind, and in its own try, so it can't stop the wipe. A removal that
      // didn't land is a step that failed (`clear` resolves false).
      const draftCleared = await eraseStep('the Log draft', () => useLogDraftStore.getState().clear());

      let owners: string[];
      try {
        // Everything on the phone, whoever's it was (main session,
        // 2026-11-19): every per-user row under every account id, the age
        // band, the Warm-up and practice, in one transaction.
        owners = await wipeEverythingOnDevice();
      } catch (e) {
        // Nothing was removed (one transaction): nothing after it runs, and
        // trying again is safe.
        // eslint-disable-next-line no-console
        console.warn('[auth] erase failed:', errorForLog(e));
        return { ok: false, error: ERASE_FAILED };
      }

      // The wipe has committed, so each step after it is owed whatever
      // happens to the others: each in its own try (review, 2026-11-19). A
      // step whose write didn't land resolves false, and counts as failed.
      const steps: ReadonlyArray<readonly [string, () => unknown]> = [
        // The stored band went with it: the store forgets it, and the
        // under-13 gate, if on, stays on for the rest of the run (D70, call
        // 4); the next launch asks Apple again before anything goes. A band
        // an ask still running saved after the wipe is cleared again
        // (`forgetBand`).
        ['the age band', () => useAgeStore.getState().forgetBand()],
        // Owed wipes are done, and every account's sync cursor goes.
        ['what each account left', () => forgetAccountsAfterErase(owners)],
        ['the Warm-up', () => useWarmupStore.getState().retake()],
        // Practice, like the Warmup, belongs to the device (roadmap step 88).
        ['practice', () => usePracticeStore.getState().clear()],
        // In AsyncStorage, not the database: `forget` waits for the removal
        // and says whether it landed (`clear`, the screens', doesn't).
        ['the answer run', () => useResolveRunStore.getState().forget()],
        // As after account deletion: the choice was about the erased record,
        // and so was the day a streak checkpoint's moment played (step 194).
        // A fresh start shows the line about usage counts again, with the
        // Warm-up, before anything goes up (D69 (b)). The first two swallow a
        // failed write; the last of the three writes the whole record, the
        // two changes above included, and resolves false when that write
        // didn't land, so it stands for them too.
        ['the card choices', () => useSettingsStore.getState().setCardHiddenCategories([])],
        ['the streak moment', () => useSettingsStore.getState().setStreakMomentDay(null)],
        ['the usage line', () => useSettingsStore.getState().forgetUsageNoticeShown()],
        ['the reload', () => reloadForUser(LOCAL_GUEST_USER_ID)],
        // And what's already on the lock screen was about it too. After the
        // reload, which cancels the reminders still to come, and not awaited:
        // Erase never waits on the lock screen (code review, 2026-11-15), and
        // waiting couldn't confirm it anyway (iOS removes a delivered
        // notification after the call returns; round two, 2026-11-19).
        ['the lock screen', () => void dismissDeliveredNotifications().catch(() => {})],
        // So were the copies in the cache folders: awaited, and a copy still
        // there (a CSV export holds every title and note) fails the step, so
        // Erase says it couldn't finish and a retry sweeps again (round two,
        // 2026-11-19). And anything the Coach still showed, not waited on.
        ['the cache', () => sweepCachedCopies()],
        ['the Coach', () => resetCoach()],
      ];
      let allDone = draftCleared;
      for (const [name, step] of steps) {
        if (!(await eraseStep(name, step))) allDone = false;
      }
      return allDone ? { ok: true } : { ok: false, error: ERASE_FAILED };
    }),

  countUnsyncedAccountChanges: async () => {
    try {
      return await countUnsyncedForAccounts();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] could not count what Erase would lose:', errorForLog(e));
      return null;
    }
  },
}));

/**
 * One of Erase's steps, run on its own: true when it went. A step fails when
 * it throws, or when it resolves to `false`: the helpers that swallow their
 * own storage errors say so that way (re-review round two, 2026-11-19: the
 * Log draft's `clear`, the answer run's `forget`, the settings'
 * `forgetUsageNoticeShown`, the age store's `forgetBand`, and
 * `forgetAccountsAfterErase` here). Any other value, `undefined` included,
 * is a step that went. A failure is logged by the step's name and the
 * error's code and message (errorForLog), never thrown, so the next step
 * still runs. Never throws.
 */
async function eraseStep(name: string, step: () => unknown): Promise<boolean> {
  try {
    if ((await step()) === false) {
      // eslint-disable-next-line no-console
      console.warn(`[auth] erase: ${name} failed: a write did not land`);
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[auth] erase: ${name} failed:`, errorForLog(e));
    return false;
  }
}

/**
 * The sign-out stops, or the session didn't end after all: the account stays
 * signed in, so it syncs again, and the wipe this sign-out marked as owed is
 * dropped (one a deletion marked earlier stays). When its rows were already
 * wiped (`wiped`, the session's end failed after the wipe), what reached the
 * server comes back with a sync, which starts now (the wipe cleared the
 * cursor, so it pulls everything), and the lists show the account meanwhile.
 * Nothing unsynced was lost unasked: the wipe only ran on what the person
 * agreed to (the caller says so, `SIGN_OUT_FAILED_AFTER_WIPE`). Under the
 * under-13 rule the sync is refused (`syncForUser`), so nothing comes back
 * while it applies (the caller says so too,
 * `SIGN_OUT_FAILED_AFTER_WIPE_LOCAL_ONLY`). Never throws.
 */
async function keepAccount(userId: string, addedOwed: boolean, wiped: boolean): Promise<void> {
  resumeSyncFor(userId);
  if (addedOwed) await markers.settleOwedWipe(userId);
  if (!wiped) return;
  try {
    await reloadForUser(userId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auth] reload after a sign-out that did not end failed:', errorForLog(e));
  }
  void syncForUser(userId);
}

/**
 * The question sign-out returns: what signing out would lose for good, both
 * counts. Remembered for this account, so the answer, `discardUnsynced`,
 * agrees to exactly that (N2).
 */
function askAbout(
  account: string,
  atStake: AtStake,
): { ok: false; unsynced: number; localCategories: number } {
  askedAbout = { account, atStake };
  return { ok: false, unsynced: atStake.unsynced, localCategories: atStake.localCategories };
}

// Predictions sync. Local SQLite remains the source of truth; this module
// reconciles it against the Postgres mirror in two steps:
//
//   pullRemote  — fetch rows updated since the per-user cursor, write them
//                 into local only when remote.updated_at > local.updated_at
//                 (last-write-wins). Advances the cursor regardless of
//                 whether the row was written (we've now seen it).
//   pushDirty   — read local rows where dirty=1, batch-upsert to Postgres,
//                 mark dirty=0 only if updated_at hasn't moved during the
//                 push. Per-row fallback on batch error.
//   pushDeletions — delete on the server every prediction deleted here
//                 (roadmap D25), from the local tombstones, then clear each
//                 tombstone. Runs first, and pull skips any id still
//                 tombstoned, so a delete never comes back from the server.
//                 Another device keeps its copy until it is deleted there.
//                 One exception both make (round 6, item 6; round 7): a row
//                 the server holds answered differently from anything this
//                 phone saw (answered on another phone that hadn't heard of
//                 the delete, before it or after) is restored here and its
//                 tombstone dropped (`reconcileTombstoneWithRemote`, src/db),
//                 never deleted on the server. The server delete is
//                 conditional (`deletionMatch`: the row open, as this phone
//                 deleted it, or as this phone last synced it), so this holds
//                 in a sweep and in sign-out's push, which pulls nothing, with
//                 no gap between a check and the delete. A deletion whose row
//                 the read-back keeps waits an hour before it is sent again.
//
//   backfillOffsets — once per account with `UTC_OFFSET_SYNC` on (review
//                 round 6, 2026-11-19): fill the UTC offsets the server never
//                 got for rows pushed before the flag. Update-only requests,
//                 one row and one column each, that write a column only while
//                 the server's is still null and only for the same moment;
//                 nothing is inserted, no row is re-pushed whole and no
//                 `updated_at` moves. Last in a sweep, at most
//                 `OFFSET_BACKFILL_MAX_REQUESTS` (200) a sweep, going on at
//                 the next; marked done (`markOffsetBackfillDone`, src/db)
//                 once every row has gone without a failure.
//
// `syncNow` orchestrates pull → push, then asks statsStore to recompute iff
// anything actually changed. The app's callers go through authStore's
// syncForUser, which also reloads the prediction lists. Every failure is logged with console.warn and
// swallowed — sync is non-critical and must never break the offline loop.
// The log carries an error's code and message only: a Postgres constraint
// error's details repeat the failing row, title and reflection included, and
// release builds keep console.warn in the device log (security review,
// 2026-11-18).
//
// A sweep belongs to the account it started for. Before the pull, each push
// and each delete it checks that the client's session is still that
// account's, and stops if not: a sign-out or a switch mid-sweep must not send
// one account's rows under the next one's session.
//
// An account whose rows are leaving the phone (sign-out, D69 (a); a session
// that ended after its deletion was asked for) is stopped first
// (`stopSyncFor`): no new sweep starts for it, a running one writes nothing
// more to the phone (a pull's rows landing after the wipe would put the
// account back), and the caller waits for it to finish before wiping.
// `pushNow` is the one more push sign-out makes before it counts what is
// still unsynced.
//
// The under-13 rule (roadmap D70, 2026-11-19): while the phone is local-only
// (`isLocalOnly`, src/store/ageStore.ts) nothing here sends anything.
// `syncNow`, `pushNow` and `backfillOffsets` return at once, and so do the
// exported helpers (`pullRemote`, `pushDirty`, `pushDeletions`); the check a
// sweep makes before each request (`sessionStillFor`, and the rule checked
// again around any check a caller passes in) returns false, so a sweep or a
// push already running stops before its next request. Rows stay dirty and
// deletions pending, so sign-out's question counts them: its last push sends
// nothing, and what the person is told would be lost is what this phone
// holds that the server doesn't.
//
// And a sweep waits for Apple's answer on a launch that asks (the age store
// not yet `settled`), as the guest flush and RevenueCat do (call 2): a child's
// first answer can arrive after the launch's sweep has started, and an
// account signed in before any band was stored would otherwise sync its
// rows in that window. Unlike theirs, this wait has a cap, `AGE_SYNC_WAIT_MS`
// (60 s), counted from when the age store began waiting (main session,
// 2026-11-19): a backup that never runs costs an adult their data if the
// phone is lost, nobody has yet seen what an age request that never resolves
// does on an iPhone, and the case the wait protects is rare. After the cap the
// sweep goes on as before, and every gate still holds: an under-13 answer that
// arrives later makes the entry points do nothing and stops a running sweep
// before its next request. Stopping the account (`stopSyncFor`) ends the wait
// too. Sign-out's `pushNow` waits at most 5 s (`AGE_ANSWER_WAIT_MS`) from its
// own call, then goes on.
//
// Layer rule: L5. Imports @/db, @/supabase, @/types, and @/store. The
// store-imports cross L4 in `defaultRecompute` (which uses the statsStore to
// rebuild derived stats after pulling) and for the age store, a leaf. All
// lower-level helpers accept their deps by parameter for testability.
//
// Clock-skew assumption: every local write stamps `updated_at` with the
// client clock. The Postgres `now()` default only applies to direct dashboard
// edits, which the app does not perform. Two-client conflicts therefore
// resolve by client-clock ordering — accept this; it's a small-multi-device
// app for a single user.

import type { SupabaseClient } from '@supabase/supabase-js';

import { UTC_OFFSET_SYNC } from '@/constants/app';
import {
  getPredictionUpdatedAt,
  isDeletedHere,
  listDirtyPredictionsSettled,
  listOffsetBackfill,
  listPendingTombstonesSettled,
  markDeletionPushed,
  markOffsetBackfillDone,
  markPredictionSynced,
  offsetBackfillDone,
  reconcileTombstoneWithRemote,
  upsertPredictionFromRemote,
} from '@/db/predictions';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { AGE_ANSWER_WAIT_MS, isLocalOnly, useAgeStore } from '@/store/ageStore';
import { useStatsStore } from '@/store/statsStore';
import {
  isStoredInstant,
  isUtcOffsetMinutes,
  type OffsetBackfillRow,
  type PendingTombstone,
  type PredictionWireRow,
} from '@/types';

import { getSupabaseClient, isSupabaseConfigured } from './client';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface SyncResult {
  pulled: number;
  pushed: number;
}

export interface CursorStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, cursor: string): Promise<void>;
  /** Forget the user's cursor (account deletion). Optional so older fakes still fit. */
  remove?(userId: string): Promise<void>;
}

export interface SyncDeps {
  /** Override the SupabaseClient (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Cursor store for pull progress; defaults to AsyncStorage-backed. */
  cursorStore?: CursorStore;
  /** Recompute derived stats after sync — defaults to statsStore.recomputeForUser. */
  recompute?: (userId: string) => Promise<void>;
  /**
   * Whose session the client holds now, or null for none. Defaults to the
   * client's own `auth.getSession()`.
   */
  sessionUserId?: () => Promise<string | null>;
}

const ZERO: SyncResult = { pulled: 0, pushed: 0 };
const EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';

// A modest cap so a one-shot pull doesn't pull a million rows. Hitting this
// just means the next sweep continues — no data loss.
const MAX_PULL_BATCH = 500;

/**
 * Accounts whose rows are leaving the phone (`stopSyncFor`): no sweep starts
 * for them, and a running one writes nothing more.
 */
const stoppedUsers = new Set<string>();

/** How long sign-out's one more push, and a stop's wait for a running sweep, may take. */
const DEFAULT_WAIT_MS = 10_000;

/**
 * The most rows one push sends. Supabase migration 011
 * (supabase/migrations/011_offsets_answers_limits.sql,
 * `predictions_write_limits`) enforces this ceiling: an upsert of more than
 * 100 new or more than 100 changed rows is refused whole with PT413. The
 * analytics flush sends the same 100 (BATCH_SIZE in src/analytics/flush.ts).
 */
export const PUSH_BATCH_SIZE = 100;

/**
 * The server's write limits (migration 011): PT429, the account is at a cap
 * (50,000 predictions, or its text budget, which refuses only statements that
 * add text: answers, category moves and shorter notes still go through);
 * PT413, too many rows in one request (can't happen with batches of 100, and
 * is handled the same way if it ever does).
 */
const LIMIT_CODES: ReadonlySet<string> = new Set(['PT429', 'PT413']);

/** The account-cap refusal, after which a row waits before it is sent again. */
const AT_CAP_CODE = 'PT429';

/**
 * How long a row refused alone at an account cap (PT429) waits before a push
 * sends it again (round 6, server re-review LOW-I: it was retried every
 * sweep). It stays dirty meanwhile, so sign-out still counts it.
 */
export const AT_CAP_RETRY_MS = 60 * 60_000;

/**
 * Rows refused alone at an account cap, by account: the `updated_at` that was
 * refused and until when it waits. In memory only, so a new run tries again.
 * A row changed since (a new `updated_at`) is sent at the next push.
 */
const heldAtCap = new Map<string, Map<string, { updatedAt: string; until: number }>>();

/** Whether `row` is waiting out a refusal at an account cap; forgets one that is over. */
function isHeldAtCap(userId: string, row: PredictionWireRow, now: number): boolean {
  const held = heldAtCap.get(userId);
  const entry = held?.get(row.id);
  if (!held || !entry) return false;
  if (entry.updatedAt === row.updated_at && entry.until > now) return true;
  held.delete(row.id);
  if (held.size === 0) heldAtCap.delete(userId);
  return false;
}

function holdAtCap(userId: string, row: PredictionWireRow): void {
  let held = heldAtCap.get(userId);
  if (!held) {
    held = new Map();
    heldAtCap.set(userId, held);
  }
  held.set(row.id, { updatedAt: row.updated_at, until: Date.now() + AT_CAP_RETRY_MS });
}

function releaseAtCap(userId: string, rowId: string): void {
  const held = heldAtCap.get(userId);
  if (!held) return;
  held.delete(rowId);
  if (held.size === 0) heldAtCap.delete(userId);
}

/**
 * How long a deletion waits before it is sent again when the read-back after
 * it kept its tombstone (`reconcileTombstoneWithRemote` returned 'kept': the
 * server still holds a row the deletion covers, which the delete didn't
 * remove; a filter that can't express the copy, say). The same hour as a row
 * refused at a cap: sent every sweep, it would be kept every sweep. It stays
 * pending meanwhile, so sign-out still counts it as unsynced.
 */
export const KEPT_DELETION_RETRY_MS = AT_CAP_RETRY_MS;

/**
 * Deletions kept by the read-back, by account: the tombstone as it was sent
 * (`tombstoneKey`) and until when it waits. In memory only, so a new run
 * tries again. A tombstone written again since (a new deletion of the same
 * id: a new `deleted_at`) is sent at the next push.
 */
const heldDeletions = new Map<string, Map<string, { key: string; until: number }>>();

/** A tombstone's identity for the hold: when it was made and both copies it carries. */
function tombstoneKey(tombstone: PendingTombstone): string {
  return JSON.stringify([
    tombstone.deleted_at,
    tombstone.deleted_status,
    tombstone.deleted_resolved_at,
    tombstone.synced_status,
    tombstone.synced_resolved_at,
  ]);
}

/** Whether `tombstone` is waiting out a kept read-back; forgets a hold that is over. */
function isDeletionHeld(userId: string, tombstone: PendingTombstone, now: number): boolean {
  const held = heldDeletions.get(userId);
  const entry = held?.get(tombstone.id);
  if (!held || !entry) return false;
  if (entry.key === tombstoneKey(tombstone) && entry.until > now) return true;
  held.delete(tombstone.id);
  if (held.size === 0) heldDeletions.delete(userId);
  return false;
}

function holdDeletion(userId: string, tombstone: PendingTombstone): void {
  let held = heldDeletions.get(userId);
  if (!held) {
    held = new Map();
    heldDeletions.set(userId, held);
  }
  held.set(tombstone.id, { key: tombstoneKey(tombstone), until: Date.now() + KEPT_DELETION_RETRY_MS });
}

function releaseDeletion(userId: string, id: string): void {
  const held = heldDeletions.get(userId);
  if (!held) return;
  held.delete(id);
  if (held.size === 0) heldDeletions.delete(userId);
}

/** Forget holds on tombstones no longer pending (pushed, dropped by a pull's restore, wiped). */
function forgetUnlistedDeletions(userId: string, listed: readonly PendingTombstone[]): void {
  const held = heldDeletions.get(userId);
  if (!held) return;
  const ids = new Set(listed.map((t) => t.id));
  for (const id of [...held.keys()]) {
    if (!ids.has(id)) held.delete(id);
  }
  if (held.size === 0) heldDeletions.delete(userId);
}

/** The limit a push was refused for, or null for any other failure. */
function limitCode(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const { code } = e as { code?: unknown };
  return typeof code === 'string' && LIMIT_CODES.has(code) ? code : null;
}

// ----------------------------------------------------------------------------
// Default deps
// ----------------------------------------------------------------------------

function cursorKey(userId: string): string {
  return `calibrate:sync_cursor:${userId}`;
}

function defaultCursorStore(): CursorStore {
  return {
    async get(userId) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      return await AsyncStorage.getItem(cursorKey(userId));
    },
    async set(userId, cursor) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(cursorKey(userId), cursor);
    },
    async remove(userId) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem(cursorKey(userId));
    },
  };
}

/**
 * Forget a user's pull cursor, `calibrate:sync_cursor:<user id>`
 * (docs/ACCOUNT_SPEC.md §3.4: after account deletion's wipe). Never throws: a
 * cursor left behind holds only a timestamp, under a deleted account's id.
 */
export async function clearSyncCursor(
  userId: string,
  cursorStore: CursorStore = defaultCursorStore(),
): Promise<void> {
  try {
    await cursorStore.remove?.(userId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] could not clear the sync cursor:', errorForLog(e));
  }
}

/**
 * An error as the device log may carry it: its code and message. Never the
 * object: a Postgres error's `details` repeat the failing row and its `hint`
 * can quote values.
 */
function errorForLog(e: unknown): string {
  if (typeof e !== 'object' || e === null) return 'unknown error';
  const { code, message } = e as { code?: unknown; message?: unknown };
  const parts: string[] = [];
  if (typeof code === 'string' || typeof code === 'number') parts.push(`[${code}]`);
  if (typeof message === 'string') parts.push(message);
  return parts.length > 0 ? parts.join(' ') : 'unknown error';
}

/** Whose session `client` holds, or null for none or when it can't be read. */
async function clientSessionUserId(client: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await client.auth.getSession();
    const id = data?.session?.user?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

/**
 * A check that the client's session is still `userId`'s, for a sweep that
 * started for it, that the account isn't being taken off the phone
 * (`stopSyncFor`), and that the under-13 rule doesn't apply (D70): checked
 * before the session is read, so no session read is made under the rule, and
 * again after it. Fails safe: a session that can't be read reads as someone
 * else's, and the sweep stops.
 */
function sessionStillFor(
  userId: string,
  client: SupabaseClient,
  sessionUserId?: () => Promise<string | null>,
): () => Promise<boolean> {
  return async () => {
    if (isLocalOnly() || stoppedUsers.has(userId)) return false;
    try {
      const current = sessionUserId ? await sessionUserId() : await clientSessionUserId(client);
      return current === userId && !isLocalOnly();
    } catch {
      return false;
    }
  };
}

/**
 * `stillCurrent` with the under-13 rule checked before and after it, for the
 * exported helpers, whose callers may pass a check of their own: a request is
 * sent only while the rule doesn't apply, whatever the check passed in.
 */
function whileNotLocalOnly(stillCurrent: () => Promise<boolean>): () => Promise<boolean> {
  return async () => {
    if (isLocalOnly()) return false;
    const current = await stillCurrent();
    return current && !isLocalOnly();
  };
}

/**
 * The longest a sweep waits for Apple's answer on a launch that asks, counted
 * from when the age store began waiting (`ageWaitStartedAt`); after it the
 * sweep goes on as before, every gate still in force. Why there is a cap at
 * all: the header comment.
 */
export const AGE_SYNC_WAIT_MS = 60_000;

/**
 * When the age store last began waiting for Apple's answer (`settled` turned
 * false), or null while it has one: a sweep's cap counts from here, not from
 * the sweep's own start, so a sweep started late in a long wait doesn't wait
 * a full minute more.
 */
let ageWaitStartedAt: number | null = useAgeStore.getState().settled ? null : Date.now();
useAgeStore.subscribe((state, prev) => {
  if (state.settled) ageWaitStartedAt = null;
  else if (prev.settled || ageWaitStartedAt === null) ageWaitStartedAt = Date.now();
});

/** What is left of a sweep's `AGE_SYNC_WAIT_MS`, in ms (0 or less: none). */
function syncWaitLeft(): number {
  if (useAgeStore.getState().settled || ageWaitStartedAt === null) return 0;
  return ageWaitStartedAt + AGE_SYNC_WAIT_MS - Date.now();
}

/** Sweeps and pushes waiting for Apple's answer, by account: `stopSyncFor` wakes them. */
const ageWaiters = new Map<string, Set<() => void>>();

/**
 * Resolves once Apple has answered on this launch (at once when it has, or
 * when this launch doesn't ask), when `userId`'s sync is stopped
 * (`stopSyncFor`), or after `maxWaitMs`, whichever comes first (at once for
 * a cap of 0 or less). Leaves no timer or subscription behind once resolved.
 * Never rejects. Says nothing about the answer: read `isLocalOnly()`
 * afterwards.
 */
function whenAgeSettledOrStopped(userId: string, maxWaitMs: number): Promise<void> {
  if (useAgeStore.getState().settled || stoppedUsers.has(userId) || !(maxWaitMs > 0)) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    const wakers = ageWaiters.get(userId) ?? new Set<() => void>();
    const finish = () => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe?.();
      wakers.delete(finish);
      if (wakers.size === 0 && ageWaiters.get(userId) === wakers) ageWaiters.delete(userId);
      resolve();
    };
    wakers.add(finish);
    ageWaiters.set(userId, wakers);
    unsubscribe = useAgeStore.subscribe((state) => {
      if (state.settled) finish();
    });
    timer = setTimeout(finish, maxWaitMs);
  });
}

async function defaultRecompute(userId: string): Promise<void> {
  await useStatsStore.getState().recomputeForUser(userId);
}

interface ResolvedDeps {
  client: SupabaseClient | null;
  cursorStore: CursorStore;
  recompute: (userId: string) => Promise<void>;
  sessionUserId?: () => Promise<string | null>;
}

function resolveDeps(deps?: SyncDeps): ResolvedDeps {
  const client =
    deps?.client !== undefined
      ? deps.client
      : isSupabaseConfigured()
        ? getSupabaseClient()
        : null;
  return {
    client,
    cursorStore: deps?.cursorStore ?? defaultCursorStore(),
    recompute: deps?.recompute ?? defaultRecompute,
    sessionUserId: deps?.sessionUserId,
  };
}

// ----------------------------------------------------------------------------
// Helpers — testable in isolation
// ----------------------------------------------------------------------------

/**
 * Fetch remote predictions newer than the cursor and merge them into local.
 * Returns the count of local rows actually written.
 *
 * Conflict policy: remote wins iff remote.updated_at > local.updated_at.
 * Equal timestamps don't trigger a write — the local copy is already in sync.
 */
export async function pullRemote(
  userId: string,
  client: SupabaseClient,
  cursorStore: CursorStore,
): Promise<number> {
  // The under-13 rule (D70): no request, here or after the cursor's read.
  if (isLocalOnly()) return 0;
  const cursorRaw = await cursorStore.get(userId);
  const cursor = cursorRaw ?? EPOCH_CURSOR;
  if (isLocalOnly()) return 0;

  const { data, error } = await client
    .from('predictions')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', cursor)
    .order('updated_at', { ascending: true })
    .limit(MAX_PULL_BATCH);

  if (error) throw error;
  if (!data || data.length === 0) return 0;

  let written = 0;
  let lastSeen = cursor;

  for (const raw of data) {
    // The account is leaving the phone (`stopSyncFor`): nothing more is
    // written, and the cursor stays where it was.
    if (stoppedUsers.has(userId)) return written;
    const remote = raw as PredictionWireRow;
    // Defense: RLS should already filter, but a misconfigured server could
    // return foreign rows. Skip them rather than writing them locally.
    if (remote.user_id !== userId) continue;

    // Deleted here (roadmap D25): don't resurrect it, whether or not the
    // server has the deletion yet. The cursor still moves past it;
    // pushDeletions removes the server copy. Unless the server's copy was
    // answered differently from what this phone deleted (round 6, item 6;
    // round 7): then the answer stands, the tombstone goes and the row is
    // written here.
    if (await isDeletedHere(remote.id)) {
      if (stoppedUsers.has(userId)) return written;
      const reconciled = await reconcileTombstoneWithRemote(remote);
      if (reconciled === 'restored') written += 1;
      if (reconciled !== 'none') {
        if (remote.updated_at > lastSeen) lastSeen = remote.updated_at;
        continue;
      }
      // 'none': the tombstone went meanwhile; the row is pulled as any is.
    }

    const localUpdatedAt = await getPredictionUpdatedAt(remote.id);
    if (!localUpdatedAt || localUpdatedAt < remote.updated_at) {
      if (stoppedUsers.has(userId)) return written;
      await upsertPredictionFromRemote(remote);
      written += 1;
    }
    if (remote.updated_at > lastSeen) lastSeen = remote.updated_at;
  }

  if (stoppedUsers.has(userId)) return written;
  if (lastSeen !== cursor) {
    await cursorStore.set(userId, lastSeen);
  }

  if (data.length === MAX_PULL_BATCH) {
    // eslint-disable-next-line no-console
    console.warn(
      `[sync] pull hit MAX_PULL_BATCH=${MAX_PULL_BATCH}; remaining rows will pull on the next sweep`,
    );
  }

  return written;
}

/**
 * Push every locally-dirty prediction. Returns the count of rows successfully
 * pushed (and marked clean). Per-row fallback on batch error so a single bad
 * row doesn't block the others.
 *
 * A prediction filed under a category the person added (roadmap D39) goes up
 * like any other, carrying only the category's id: the names stay on each
 * phone. The date a prediction was reworded (`title_edited_at`, D45) goes up
 * with the row.
 *
 * Each request first checks that the client's session is still `userId`'s
 * (`stillCurrent`, by default the client's own session) and stops if not.
 *
 * In batches of at most `PUSH_BATCH_SIZE` (100) rows, oldest change first,
 * the ceiling Supabase migration 011 enforces. A refused batch is tried once
 * more one row at a time (at most 100 requests), and the push goes on to the
 * next batch. That includes a refusal for a server limit (PT429, PT413): the
 * text budget refuses only rows that add text, so an answer or a category
 * move in the same batch still goes through alone. A row refused alone stays
 * dirty for the next sweep, and sign-out counts it as unsynced, so the person
 * is asked before it is discarded. For a limit, only its code (and how many
 * rows) is logged.
 *
 * A row refused alone at an account cap (PT429) isn't sent again for an hour
 * (`AT_CAP_RETRY_MS`, in memory, per account) unless it changes; it stays
 * dirty and counted meanwhile (round 6, server re-review LOW-I).
 */
export async function pushDirty(
  userId: string,
  client: SupabaseClient,
  givenStillCurrent: () => Promise<boolean> = sessionStillFor(userId, client),
): Promise<number> {
  // The under-13 rule (D70): nothing is sent, and the rule is checked again
  // before each request whatever check was passed in.
  if (isLocalOnly()) return 0;
  const stillCurrent = whileNotLocalOnly(givenStillCurrent);
  // Read once every queued transaction has settled (review round 5): an
  // unqueued read on the one connection sees a transaction's uncommitted
  // writes, and one pushed that then rolled back would come back on the next
  // pull.
  const now = Date.now();
  const dirty = (await listDirtyPredictionsSettled(userId)).filter(
    (row) => !isHeldAtCap(userId, row, now),
  );
  if (dirty.length === 0) return 0;

  const upsertBatch = async (rows: PredictionWireRow[]) => {
    const { error } = await client
      .from('predictions')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  };

  let pushed = 0;
  for (let start = 0; start < dirty.length; start += PUSH_BATCH_SIZE) {
    const batch = dirty.slice(start, start + PUSH_BATCH_SIZE);
    if (!(await stillCurrent())) return pushed;
    try {
      await upsertBatch(batch);
      for (const row of batch) {
        await markPredictionSynced(row.id, row.updated_at);
      }
      pushed += batch.length;
    } catch (batchErr) {
      const batchLimit = limitCode(batchErr);
      // eslint-disable-next-line no-console
      console.warn(
        '[sync] batch push failed, falling back to per-row:',
        batchLimit ?? errorForLog(batchErr),
      );
      // Rows refused alone for a limit, by code: logged once for the batch.
      const refusedAtLimit = new Map<string, number>();
      for (const row of batch) {
        if (!(await stillCurrent())) return pushed;
        try {
          await upsertBatch([row]);
          releaseAtCap(userId, row.id);
          await markPredictionSynced(row.id, row.updated_at);
          pushed += 1;
        } catch (rowErr) {
          const rowLimit = limitCode(rowErr);
          if (rowLimit) {
            refusedAtLimit.set(rowLimit, (refusedAtLimit.get(rowLimit) ?? 0) + 1);
            // At a cap: sending it again soon would be refused again.
            if (rowLimit === AT_CAP_CODE) holdAtCap(userId, row);
          } else {
            // eslint-disable-next-line no-console
            console.warn(`[sync] push failed for ${row.id}:`, errorForLog(rowErr));
          }
        }
      }
      for (const [code, count] of refusedAtLimit) {
        // eslint-disable-next-line no-console
        console.warn(`[sync] ${count} row(s) refused (${code}); they stay on this phone`);
      }
    }
  }
  return pushed;
}

/**
 * Delete on the server every prediction this device deleted (roadmap D25),
 * then mark each tombstone pushed (kept, so it is still counted, D45). Per
 * row, so one failure leaves only that tombstone for the next sweep. Returns how many reached the server. Each
 * delete first checks the session is still `userId`'s, as pushDirty does.
 *
 * The delete is conditional (round 6, item 6; round 7): it removes the
 * server's row only as this phone saw it (`deletionMatch`: open, the copy
 * this phone deleted, or the copy it last synced, each answer with its own
 * `resolved_at`), in the same statement, so no answer given elsewhere, before
 * this phone's delete or after, is removed, and none can land between a check
 * and the delete. Round 6 removed any row answered no later than the
 * deletion, which took an answer given on another phone days before from a
 * phone that still held the prediction open. When it removes nothing, the
 * row is read: none on the server, and the deletion is done; one there goes
 * to `reconcileTombstoneWithRemote`, which restores a row answered
 * differently from anything this phone saw and drops the tombstone. A
 * tombstone whose time can't be read is never sent.
 *
 * A tombstone the read-back keeps (the server holds a row the deletion
 * covers, which the delete didn't remove) isn't sent again for an hour
 * (`KEPT_DELETION_RETRY_MS`, in memory, per account) unless it is written
 * again; it stays pending, and counted as unsynced, meanwhile.
 */
export async function pushDeletions(
  userId: string,
  client: SupabaseClient,
  stillCurrent: () => Promise<boolean> = sessionStillFor(userId, client),
): Promise<number> {
  // The under-13 rule (D70); pushDeletionsCounted checks it before each request too.
  if (isLocalOnly()) return 0;
  return (await pushDeletionsCounted(userId, client, stillCurrent)).deleted;
}

/** An instant as the phone writes one (`nowIso`). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

/** Whether a tombstone's `deleted_at` reads as an instant: one that doesn't is never sent. */
function isDeletionTime(deletedAt: unknown): deletedAt is string {
  return typeof deletedAt === 'string' && ISO_INSTANT.test(deletedAt) && !Number.isNaN(Date.parse(deletedAt));
}

/** The statuses of an answered row: Yes, No and Can't tell. */
const ANSWERED_STATUSES: ReadonlySet<string> = new Set(['resolved_yes', 'resolved_no', 'skipped']);

/**
 * Which server row a deletion may remove (review round 7): a row this phone
 * saw, never one an answer given elsewhere has changed. The server-side half
 * of `tombstoneCovers` (src/db), the rule the read-back's
 * `reconcileTombstoneWithRemote` keeps a tombstone by, so a row this filter
 * leaves on the server is one the reconcile restores (the server compares
 * times to the microsecond, `tombstoneCovers` to the millisecond; every
 * stored time was written by a phone in milliseconds or copied from the
 * server as it was). Takes the tombstone's two copies (`PendingTombstone`)
 * and reads them defensively: a value that isn't one it knows counts as no
 * copy.
 *
 * The server's row goes when it is:
 *   - open (`status = pending`): an open row holds no answer, and the server
 *     never puts an answer back to open (migration 011), so a deletion can't
 *     wait on that row forever, whatever this phone's copies were;
 *   - the copy this phone deleted (`deleted_status`, `deleted_resolved_at`);
 *   - the copy this phone last synced (`synced_status`,
 *     `synced_resolved_at`). An answer changed here after it synced (Yes to
 *     No with "Change answer", which keeps `resolved_at`; a synced "Can't
 *     tell" answered later) is still the synced version on the server until
 *     the change goes up, and a deletion of it matched only the deleted copy,
 *     removed nothing, and the read-back brought the old answer back.
 *
 * Each answered copy (Yes, No or Can't tell) counts only with a `resolved_at`
 * that passes `isStoredInstant` (src/types), the check `tombstoneCovers`
 * makes too, so the two halves read the same copies; an open copy, a status
 * it doesn't know or a time it can't read adds nothing beyond `status =
 * pending`.
 *
 *   'open': no answered copy counts (deleted open; a tombstone from before
 *     the copies were kept; nothing readable): only a row still open on the
 *     server goes. An answer the server holds stays, whenever it was given.
 *   'answered': `filter` is the PostgREST `or` for `status.eq.pending` and
 *     one `and(status.eq.<s>,resolved_at.eq."<t>")` per distinct answered
 *     copy, the deleted copy first. The time double-quoted, as PostgREST asks
 *     for a value holding `:` or `.` inside a logical filter
 *     (`@supabase/postgrest-js` 2.106 passes `or()` through as written), and
 *     compared by the server as an instant (an untyped literal takes the
 *     column's type, timestamptz). The time goes as stored, never re-written
 *     through `Date` (a pulled time's microseconds would go, and nothing would
 *     match). The status is one of three fixed words and the time has the one
 *     shape `isStoredInstant` accepts, which holds no character that could
 *     leave the quotes or the term.
 */
export type DeletionMatch = { kind: 'open' } | { kind: 'answered'; filter: string };

export function deletionMatch(tombstone: {
  deleted_status?: string | null;
  deleted_resolved_at?: string | null;
  synced_status?: string | null;
  synced_resolved_at?: string | null;
}): DeletionMatch {
  const terms: string[] = [];
  for (const term of [
    answeredTerm(tombstone.deleted_status, tombstone.deleted_resolved_at),
    answeredTerm(tombstone.synced_status, tombstone.synced_resolved_at),
  ]) {
    if (term !== null && !terms.includes(term)) terms.push(term);
  }
  if (terms.length === 0) return { kind: 'open' };
  return { kind: 'answered', filter: ['status.eq.pending', ...terms].join(',') };
}

/**
 * One answered copy as a PostgREST `and` term, or null when it isn't one: a
 * status other than Yes, No or Can't tell, or a time `isStoredInstant` doesn't
 * accept.
 */
function answeredTerm(status: unknown, resolvedAt: unknown): string | null {
  if (typeof status !== 'string' || !ANSWERED_STATUSES.has(status)) return null;
  if (!isStoredInstant(resolvedAt)) return null;
  return `and(status.eq.${status},resolved_at.eq."${resolvedAt}")`;
}

/** `pushDeletions`, also saying how many rows it restored here (for the recompute). */
async function pushDeletionsCounted(
  userId: string,
  client: SupabaseClient,
  givenStillCurrent: () => Promise<boolean>,
): Promise<{ deleted: number; restored: number }> {
  // The under-13 rule (D70): nothing is sent, and the rule is checked again
  // before each request whatever check was passed in.
  if (isLocalOnly()) return { deleted: 0, restored: 0 };
  const stillCurrent = whileNotLocalOnly(givenStillCurrent);
  // Settled, as pushDirty's read is: a delete that rolls back is never sent.
  const listed: PendingTombstone[] = await listPendingTombstonesSettled(userId);
  forgetUnlistedDeletions(userId, listed);
  // A deletion the read-back kept waits out its hour (`KEPT_DELETION_RETRY_MS`).
  const now = Date.now();
  const tombstones = listed.filter((tombstone) => !isDeletionHeld(userId, tombstone, now));
  let deleted = 0;
  let restored = 0;
  for (const tombstone of tombstones) {
    const { id, deleted_at: deletedAt } = tombstone;
    if (!isDeletionTime(deletedAt)) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] a deletion with no readable time stays on this phone: ${id}`);
      continue;
    }
    if (!(await stillCurrent())) break;
    try {
      const match = deletionMatch(tombstone);
      const request = client.from('predictions').delete().eq('id', id).eq('user_id', userId);
      const { data, error } = await (
        match.kind === 'open' ? request.eq('status', 'pending') : request.or(match.filter)
      ).select('id');
      if (error) throw error;
      if (Array.isArray(data) && data.some((row: { id?: unknown } | null) => row?.id === id)) {
        await markDeletionPushed(id);
        releaseDeletion(userId, id);
        deleted += 1;
        continue;
      }

      // Nothing removed: the server holds no such row, or holds it answered
      // differently from both copies this phone saw. Read it, under this
      // account's session only (under another's it would read as missing).
      if (!(await stillCurrent())) break;
      const { data: rows, error: readError } = await client
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .in('id', [id]);
      if (readError) throw readError;
      const remote = (Array.isArray(rows) ? (rows as PredictionWireRow[]) : []).find(
        (row) => row?.id === id && row?.user_id === userId,
      );
      if (!remote) {
        // Not on the server: the deletion is done there.
        await markDeletionPushed(id);
        releaseDeletion(userId, id);
        deleted += 1;
        continue;
      }
      // The account is leaving the phone: nothing more is written to it.
      if (stoppedUsers.has(userId)) return { deleted, restored };
      const reconciled = await reconcileTombstoneWithRemote(remote);
      if (reconciled === 'kept') {
        // The server kept a row this deletion covers (`tombstoneCovers`), which
        // the delete should have removed (a copy the filter can't express,
        // say): the tombstone stays, nothing is restored, and it waits an
        // hour before it is sent again, still counted as unsynced.
        holdDeletion(userId, tombstone);
        // eslint-disable-next-line no-console
        console.warn(`[sync] the server kept ${id}; its deletion stays on this phone, tried again in an hour`);
      } else {
        // 'restored': the tombstone went, the server's row is here now.
        // 'none': the tombstone went meanwhile (a pull's restore, a wipe).
        releaseDeletion(userId, id);
        if (reconciled === 'restored') restored += 1;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] delete failed for ${id}:`, errorForLog(e));
    }
  }
  return { deleted, restored };
}

/**
 * What this phone holds for `userId` that the server doesn't and that a
 * sign-out's wipe would take: each dirty row's id and `updated_at`. Read once
 * every queued transaction has settled. Sign-out compares it with what the
 * person was told (authStore, client re-review N2): a change made since shows
 * as an id, or an `updated_at`, not in it. Deletions not yet pushed aren't
 * here: the wipe keeps them (`keepIntegrityCounts`, src/db/account.ts) and
 * they go up at the account's next sync. Throws when the read does.
 */
export async function unsyncedRows(userId: string): Promise<Map<string, string>> {
  const dirty = await listDirtyPredictionsSettled(userId);
  return new Map(dirty.map((row) => [row.id, row.updated_at]));
}

// ----------------------------------------------------------------------------
// The UTC offset backfill (review round 6, 2026-11-19)
// ----------------------------------------------------------------------------

/**
 * The most requests one sweep's offset backfill sends; it goes on from there
 * at the next sweep. One row and one column per request, so migration 011's
 * 100-changed-rows-per-statement ceiling is never near.
 */
export const OFFSET_BACKFILL_MAX_REQUESTS = 200;

/**
 * Rows per batch in the backfill. The session is checked before the first
 * batch and after each one; a batch's rows count as sent only when it was
 * still this account's after them.
 */
export const OFFSET_BACKFILL_BATCH_ROWS = 25;

/**
 * Rows whose offsets went up without a failure in this run of the app, by
 * account, so a later sweep goes on from where one stopped. In memory only:
 * after a restart the backfill starts over, which only repeats requests that
 * fill nothing (a column the server already holds is never written).
 */
const offsetBackfillSent = new Map<string, Set<string>>();

/** One server column to fill, with the moment its offset belongs to. */
interface OffsetFill {
  column: 'created_utc_offset_min' | 'title_edited_utc_offset_min';
  moment: 'created_at' | 'title_edited_at';
  offset: number;
  at: string;
}

/**
 * What `row` has to fill on the server: each usable offset with a readable
 * moment. A moment goes in the filter only in the shape `isStoredInstant`
 * (src/types) accepts, the one the deletion push's filter uses too: an ISO
 * instant carrying its own offset ('Z' or '±hh:mm'), to at most microseconds,
 * Postgres's precision. Anything else isn't sent.
 *
 * How the server compares it: postgrest-js appends the filter as written
 * (`eq.<value>`, `PostgrestFilterBuilder.eq`; URLSearchParams percent-encodes
 * a '+', so it arrives as '+', not a space, as the pull's `gt` on a pulled
 * `updated_at` already relies on), and PostgREST hands the value to Postgres as an
 * untyped literal that takes the column's type, timestamptz. So the server
 * compares instants, not text: '…14:00:00.120Z' (this phone's own writing)
 * and '…14:00:00.12+00:00' (the server's, kept on a row pulled from it) both
 * match the same stored value. The string therefore goes as it is stored,
 * not re-written through `Date`: that would cut a pulled time's microseconds,
 * and the filter would then match nothing. Carrying its own offset, the
 * session's time zone can't move it.
 */
function offsetFills(row: OffsetBackfillRow): OffsetFill[] {
  const fills: OffsetFill[] = [];
  if (isUtcOffsetMinutes(row.created_utc_offset_min) && isStoredInstant(row.created_at)) {
    fills.push({
      column: 'created_utc_offset_min',
      moment: 'created_at',
      offset: row.created_utc_offset_min,
      at: row.created_at,
    });
  }
  if (
    row.title_edited_at !== null &&
    isUtcOffsetMinutes(row.title_edited_utc_offset_min) &&
    isStoredInstant(row.title_edited_at)
  ) {
    fills.push({
      column: 'title_edited_utc_offset_min',
      moment: 'title_edited_at',
      offset: row.title_edited_utc_offset_min,
      at: row.title_edited_at,
    });
  }
  return fills;
}

/**
 * Refusals that would refuse every row alike, after which the backfill stops
 * for the sweep, as on a transport error: the column isn't on the server yet
 * (PGRST204, 42703: the flag on before migration 011 is applied), or the
 * request's session or role was refused (PGRST301–303, 42501).
 */
const OFFSET_BACKFILL_STOP_CODES: ReadonlySet<string> = new Set([
  'PGRST204',
  '42703',
  'PGRST301',
  'PGRST302',
  'PGRST303',
  '42501',
]);

type FillOutcome = { ok: true } | { ok: false; stop: boolean; code: string };

/**
 * Send one fill: an update, never an insert, of one column of one row, only
 * while the server's value is still null and only for the same moment. A row
 * the server doesn't hold (deleted on another phone), or holds with that
 * column filled or another moment, matches nothing, and nothing changes. The
 * body is that column alone, so `updated_at` stays as it is (no trigger moves
 * it: migration 011's keep-answer trigger acts only on a status change), and
 * no phone pulls the row again or sees it win a merge.
 *
 * A failure is told apart by what it would do to the next request: one with
 * no code (the network, a gateway's page), a 401, 403 or 5xx, or a code that
 * would refuse every row (`OFFSET_BACKFILL_STOP_CODES`) stops the sweep's
 * backfill; any other (PT429, say) is this row's alone. Never throws.
 */
async function sendOffsetFill(
  client: SupabaseClient,
  userId: string,
  id: string,
  fill: OffsetFill,
): Promise<FillOutcome> {
  try {
    const { error, status } = await client
      .from('predictions')
      .update({ [fill.column]: fill.offset })
      .eq('id', id)
      .eq('user_id', userId)
      .is(fill.column, null)
      .eq(fill.moment, fill.at);
    if (!error) return { ok: true };
    const rawCode: unknown = (error as { code?: unknown }).code;
    const code = typeof rawCode === 'string' && rawCode !== '' ? rawCode : null;
    const httpStatus = typeof status === 'number' ? status : 0;
    if (code === null) {
      return { ok: false, stop: true, code: httpStatus > 0 ? `HTTP ${httpStatus}` : 'network' };
    }
    const stop =
      OFFSET_BACKFILL_STOP_CODES.has(code) ||
      httpStatus === 0 ||
      httpStatus === 401 ||
      httpStatus === 403 ||
      httpStatus >= 500;
    return { ok: false, stop, code };
  } catch {
    return { ok: false, stop: true, code: 'network' };
  }
}

export interface OffsetBackfillResult {
  /** Requests sent in this call. */
  sent: number;
  /** Whether the backfill is done for the account: marked now, or before. */
  done: boolean;
}

/**
 * Fill on the server the UTC offsets rows reached it without (review round
 * 6): rows this phone pushed while `UTC_OFFSET_SYNC` was off went up without
 * them. Once per account, with the flag on, for the signed-in account while
 * its sync isn't stopped; a sweep runs it last, after the pull and the push.
 *
 * Each row from `listOffsetBackfill` sends at most two update-only requests
 * (`sendOffsetFill`), one column each:
 *
 *   update { created_utc_offset_min } where id, user_id, created_utc_offset_min
 *     is null, created_at = the row's created_at
 *   update { title_edited_utc_offset_min } where id, user_id,
 *     title_edited_utc_offset_min is null, title_edited_at = the row's
 *     (only when both are known here)
 *
 * Never an insert or an upsert, never another column, never `updated_at`
 * (here or on the server). It replaced a whole-row re-push, which could put
 * back predictions deleted on another phone and write an older copy over a
 * newer one.
 *
 * Paced: at most `OFFSET_BACKFILL_MAX_REQUESTS` (200) requests a call, one at
 * a time, in batches of `OFFSET_BACKFILL_BATCH_ROWS` rows with the session
 * checked before the first and after each (an update under another account's
 * session matches nothing and would read as done). A row counts as sent once
 * all its requests went without a failure and its batch was still this
 * account's; the next call goes on with the rest. It stops early, to go on at
 * the next sweep, on a transport error or a refusal that would refuse every
 * row, when the account is being stopped (`stopSyncFor`), or when a sign-out
 * push is waiting (`pushNow`). A refusal of one row (PT429, say) leaves that
 * row for the next sweep and the others go on. `markOffsetBackfillDone` only
 * once every listed row has been sent; then never again for the account on
 * this phone.
 *
 * Logs only codes and counts, never an id or a value. Throws only when the
 * phone's own reads or the marker's write do (a sweep logs it and goes on).
 */
export async function backfillOffsets(
  userId: string,
  client: SupabaseClient,
  givenStillCurrent: () => Promise<boolean> = sessionStillFor(userId, client),
): Promise<OffsetBackfillResult> {
  // The under-13 rule (D70): nothing is sent; checked again before each
  // request below, and around the check passed in.
  if (isLocalOnly()) return { sent: 0, done: false };
  if (!UTC_OFFSET_SYNC || userId === LOCAL_GUEST_USER_ID || stoppedUsers.has(userId)) {
    return { sent: 0, done: false };
  }
  const stillCurrent = whileNotLocalOnly(givenStillCurrent);
  if (await offsetBackfillDone(userId)) {
    offsetBackfillSent.delete(userId);
    return { sent: 0, done: true };
  }
  const rows = await listOffsetBackfill(userId);
  const sentRows = offsetBackfillSent.get(userId) ?? new Set<string>();
  offsetBackfillSent.set(userId, sentRows);
  const waiting = rows.filter((row) => !sentRows.has(row.id));

  let sent = 0;
  let halted = false;
  let pausedOn: string | null = null;
  const refused = new Map<string, number>();

  if (!(await stillCurrent())) return { sent, done: false };
  for (let start = 0; start < waiting.length && !halted; start += OFFSET_BACKFILL_BATCH_ROWS) {
    const batchSent: string[] = [];
    batch: for (const row of waiting.slice(start, start + OFFSET_BACKFILL_BATCH_ROWS)) {
      const fills = offsetFills(row);
      if (sent + fills.length > OFFSET_BACKFILL_MAX_REQUESTS) {
        halted = true;
        break;
      }
      let rowSent = true;
      for (const fill of fills) {
        // The account is leaving the phone, sign-out's push waits for this
        // sweep, or the under-13 rule now applies (D70).
        if (stoppedUsers.has(userId) || pushesRunning.has(userId) || isLocalOnly()) {
          halted = true;
          break batch;
        }
        sent += 1;
        const outcome = await sendOffsetFill(client, userId, row.id, fill);
        if (outcome.ok) continue;
        if (outcome.stop) {
          pausedOn = outcome.code;
          halted = true;
          break batch;
        }
        rowSent = false;
        refused.set(outcome.code, (refused.get(outcome.code) ?? 0) + 1);
      }
      if (rowSent) batchSent.push(row.id);
    }
    // Counted only while the session is still this account's.
    if (!(await stillCurrent())) {
      halted = true;
      break;
    }
    for (const id of batchSent) sentRows.add(id);
  }

  for (const [code, count] of refused) {
    // eslint-disable-next-line no-console
    console.warn(`[sync] offset backfill: ${count} request(s) refused (${code}); tried again at the next sweep`);
  }
  if (pausedOn !== null) {
    // eslint-disable-next-line no-console
    console.warn(`[sync] offset backfill paused (${pausedOn}); it goes on at the next sweep`);
  }

  if (halted || stoppedUsers.has(userId) || !rows.every((row) => sentRows.has(row.id))) {
    return { sent, done: false };
  }
  await markOffsetBackfillDone(userId);
  offsetBackfillSent.delete(userId);
  return { sent, done: true };
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

// Single in-flight promise per userId. A second syncNow call for the same
// user while one is running returns the running promise instead of starting
// a duplicate sweep — important when both authStore (sign-in) and the
// AppState listener (foreground) fire close together.
const inflight = new Map<string, Promise<SyncResult>>();

/**
 * One sweep for `userId`: deletions, pull, push, recompute, offset backfill.
 * Does nothing for no user, the guest, a stopped account or under the under-13
 * rule (D70). On a launch that asks Apple, waits for the answer before any
 * request, at most `AGE_SYNC_WAIT_MS` (60 s) from when the age store began
 * waiting (stopping the account ends the wait), then does nothing if the rule
 * applies, or goes on as before if there is still no answer. Never throws.
 */
export function syncNow(
  userId: string | null,
  deps?: SyncDeps,
): Promise<SyncResult> {
  if (isLocalOnly()) return Promise.resolve(ZERO);
  if (!userId || userId === LOCAL_GUEST_USER_ID || stoppedUsers.has(userId)) {
    return Promise.resolve(ZERO);
  }

  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = runSync(userId, deps).finally(() => {
    inflight.delete(userId);
  });
  inflight.set(userId, promise);
  return promise;
}

async function runSync(userId: string, deps?: SyncDeps): Promise<SyncResult> {
  // Apple's answer first, on a launch that asks, for what is left of the
  // 60 s cap; then the rule decides. Past the cap the sweep goes on, and the
  // check before each request still stops it if the rule comes on later.
  if (!useAgeStore.getState().settled) {
    await whenAgeSettledOrStopped(userId, syncWaitLeft());
    if (isLocalOnly() || stoppedUsers.has(userId)) return ZERO;
  }
  const resolved = resolveDeps(deps);
  if (!resolved.client) return ZERO;
  const stillCurrent = sessionStillFor(userId, resolved.client, resolved.sessionUserId);

  let pulled = 0;
  let pushed = 0;

  // Deletions first (roadmap D25), so the server stops holding them before
  // anything is pulled. Already reflected in local stats, so they don't count
  // toward a recompute; a row restored instead (answered after this phone
  // deleted it, item 6) does.
  try {
    pulled += (await pushDeletionsCounted(userId, resolved.client, stillCurrent)).restored;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] delete push failed:', errorForLog(e));
  }

  // The account changed while the deletions went, or the under-13 rule came
  // on: the rest of this sweep sends nothing. A row the deletions restored is
  // in SQLite already, so the stats and lists are rebuilt from it here (a
  // local recompute, no request: review round 2, item 5), as after a full
  // sweep, and as there not for an account leaving the phone.
  if (!(await stillCurrent())) {
    if (pulled > 0 && !stoppedUsers.has(userId)) {
      try {
        await resolved.recompute(userId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[sync] recompute failed:', errorForLog(e));
      }
    }
    return ZERO;
  }

  try {
    pulled += await pullRemote(userId, resolved.client, resolved.cursorStore);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] pull failed:', errorForLog(e));
  }

  try {
    pushed = await pushDirty(userId, resolved.client, stillCurrent);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] push failed:', errorForLog(e));
  }

  // Not for an account leaving the phone: its stats would be written back
  // after the wipe.
  if (pulled + pushed > 0 && !stoppedUsers.has(userId)) {
    try {
      await resolved.recompute(userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sync] recompute failed:', errorForLog(e));
    }
  }

  // The offsets pushes left out before UTC_OFFSET_SYNC (round 6): after the
  // pull and the push, and after the recompute, so the stores aren't kept
  // waiting on its requests. It changes nothing on this phone but its marker,
  // so it adds nothing to the result. Does nothing with the flag off.
  try {
    await backfillOffsets(userId, resolved.client, stillCurrent);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] offset backfill failed:', errorForLog(e));
  }

  return { pulled, pushed };
}

/** Wait for `p` at most `ms`, whichever comes first. Never rejects. */
async function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        try {
          await p;
        } catch {
          // Settled is enough.
        }
      })(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * One more push for `userId` (sign-out, D69 (a)): what is waiting to be
 * deleted on the server, then every dirty row, after any sweep already
 * running for the account. No pull and no recompute: the rows are about to
 * leave the phone. Each request checks the session is still the account's,
 * as a sweep's do. Waits at most `maxWaitMs` (default 10 s) altogether; a
 * push still running then goes on by itself, and sign-out counts what is
 * still unsynced. Returns how many rows and deletions reached the server.
 * Never throws.
 *
 * Under the under-13 rule (D70) it sends nothing and returns 0 at once, so
 * sign-out's question names every change this phone holds that the server
 * doesn't. On a launch still waiting for Apple's answer it waits for it at
 * most `AGE_ANSWER_WAIT_MS` (5 s), within the same `maxWaitMs`, then sends
 * only if the rule doesn't apply.
 */
export async function pushNow(
  userId: string | null,
  deps?: SyncDeps,
  maxWaitMs: number = DEFAULT_WAIT_MS,
): Promise<number> {
  if (isLocalOnly()) return 0;
  if (!userId || userId === LOCAL_GUEST_USER_ID || stoppedUsers.has(userId)) return 0;
  let pushed = 0;
  const run = (async () => {
    const running = inflight.get(userId);
    if (running) {
      try {
        await running;
      } catch {
        // Its own failures are logged where they happen.
      }
    }
    if (!useAgeStore.getState().settled) await whenAgeSettledOrStopped(userId, AGE_ANSWER_WAIT_MS);
    if (isLocalOnly() || stoppedUsers.has(userId)) return;
    const resolved = resolveDeps(deps);
    if (!resolved.client) return;
    const stillCurrent = sessionStillFor(userId, resolved.client, resolved.sessionUserId);
    try {
      pushed += (await pushDeletionsCounted(userId, resolved.client, stillCurrent)).deleted;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sync] delete push failed:', errorForLog(e));
    }
    try {
      pushed += await pushDirty(userId, resolved.client, stillCurrent);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sync] push failed:', errorForLog(e));
    }
  })();
  // A stop waits for it too, should it outlast this wait.
  const tracked = pushesRunning.get(userId) ?? new Set<Promise<void>>();
  tracked.add(run);
  pushesRunning.set(userId, tracked);
  void (async () => {
    try {
      await run;
    } finally {
      tracked.delete(run);
      if (tracked.size === 0 && pushesRunning.get(userId) === tracked) pushesRunning.delete(userId);
    }
  })();
  await settleWithin(run, maxWaitMs);
  return pushed;
}

/** `pushNow` runs not yet finished, by account: `stopSyncFor` waits for them too. */
const pushesRunning = new Map<string, Set<Promise<void>>>();

/**
 * Stop syncing `userId` before its rows leave the phone: no sweep starts for
 * it, a running one writes nothing more to the phone (no pulled row, no
 * cursor, no recompute) and sends nothing more, and this waits for it, and for
 * a `pushNow` still running, to finish, at most `maxWaitMs` (default 10 s)
 * altogether. One still waiting on the network after that writes nothing to
 * the phone when its answer comes, but for marking what it sent as sent.
 * Undone by `resumeSyncFor` (the session didn't end after all, or the account
 * signed in again). Never throws.
 */
export async function stopSyncFor(userId: string, maxWaitMs: number = DEFAULT_WAIT_MS): Promise<void> {
  stoppedUsers.add(userId);
  // A sweep still waiting for Apple's answer ends now, sending nothing.
  for (const wake of [...(ageWaiters.get(userId) ?? [])]) wake();
  const running: Promise<unknown>[] = [];
  const sweep = inflight.get(userId);
  if (sweep) running.push(sweep);
  for (const push of pushesRunning.get(userId) ?? []) running.push(push);
  if (running.length > 0) await settleWithin(Promise.allSettled(running), maxWaitMs);
}

/** Let `userId` sync again (`stopSyncFor`). */
export function resumeSyncFor(userId: string): void {
  stoppedUsers.delete(userId);
}

/**
 * Test-only: clear the in-flight serialization map so each test starts fresh.
 * Production code never has reason to call this — finally() handles cleanup.
 */
export function __resetSyncStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetSyncStateForTests is only allowed when NODE_ENV=test');
  }
  inflight.clear();
  stoppedUsers.clear();
  heldAtCap.clear();
  heldDeletions.clear();
  pushesRunning.clear();
  offsetBackfillSent.clear();
  for (const wakers of [...ageWaiters.values()]) for (const wake of [...wakers]) wake();
  ageWaiters.clear();
}

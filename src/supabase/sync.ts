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
// Layer rule: L5. Imports @/db, @/supabase, @/types, and @/store. The
// store-imports cross L4 only in `defaultRecompute` (which uses the
// statsStore to rebuild derived stats after pulling). All lower-level
// helpers accept their deps by parameter for testability.
//
// Clock-skew assumption: every local write stamps `updated_at` with the
// client clock. The Postgres `now()` default only applies to direct dashboard
// edits, which the app does not perform. Two-client conflicts therefore
// resolve by client-clock ordering — accept this; it's a small-multi-device
// app for a single user.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getPredictionUpdatedAt,
  isDeletedHere,
  listDirtyPredictionsSettled,
  listPendingDeletionsSettled,
  markDeletionPushed,
  markPredictionSynced,
  upsertPredictionFromRemote,
} from '@/db/predictions';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { useStatsStore } from '@/store/statsStore';
import type { PredictionWireRow } from '@/types';

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
 * started for it, and that the account isn't being taken off the phone
 * (`stopSyncFor`). Fails safe: a session that can't be read reads as someone
 * else's, and the sweep stops.
 */
function sessionStillFor(
  userId: string,
  client: SupabaseClient,
  sessionUserId?: () => Promise<string | null>,
): () => Promise<boolean> {
  return async () => {
    if (stoppedUsers.has(userId)) return false;
    try {
      const current = sessionUserId ? await sessionUserId() : await clientSessionUserId(client);
      return current === userId;
    } catch {
      return false;
    }
  };
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
  const cursorRaw = await cursorStore.get(userId);
  const cursor = cursorRaw ?? EPOCH_CURSOR;

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
    // pushDeletions removes the server copy.
    if (await isDeletedHere(remote.id)) {
      if (remote.updated_at > lastSeen) lastSeen = remote.updated_at;
      continue;
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
 */
export async function pushDirty(
  userId: string,
  client: SupabaseClient,
  stillCurrent: () => Promise<boolean> = sessionStillFor(userId, client),
): Promise<number> {
  // Read once every queued transaction has settled (review round 5): an
  // unqueued read on the one connection sees a transaction's uncommitted
  // writes, and one pushed that then rolled back would come back on the next
  // pull.
  const dirty = await listDirtyPredictionsSettled(userId);
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
          await markPredictionSynced(row.id, row.updated_at);
          pushed += 1;
        } catch (rowErr) {
          const rowLimit = limitCode(rowErr);
          if (rowLimit) {
            refusedAtLimit.set(rowLimit, (refusedAtLimit.get(rowLimit) ?? 0) + 1);
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
 * then mark each tombstone pushed (kept, so it is still counted, D45). Per row, so one failure leaves only that
 * tombstone for the next sweep. Returns how many reached the server. Each
 * delete first checks the session is still `userId`'s, as pushDirty does.
 */
export async function pushDeletions(
  userId: string,
  client: SupabaseClient,
  stillCurrent: () => Promise<boolean> = sessionStillFor(userId, client),
): Promise<number> {
  // Settled, as pushDirty's read is: a delete that rolls back is never sent.
  const ids = await listPendingDeletionsSettled(userId);
  let done = 0;
  for (const id of ids) {
    if (!(await stillCurrent())) break;
    try {
      const { error } = await client
        .from('predictions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      await markDeletionPushed(id);
      done += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] delete failed for ${id}:`, errorForLog(e));
    }
  }
  return done;
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

// Single in-flight promise per userId. A second syncNow call for the same
// user while one is running returns the running promise instead of starting
// a duplicate sweep — important when both authStore (sign-in) and the
// AppState listener (foreground) fire close together.
const inflight = new Map<string, Promise<SyncResult>>();

export function syncNow(
  userId: string | null,
  deps?: SyncDeps,
): Promise<SyncResult> {
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
  const resolved = resolveDeps(deps);
  if (!resolved.client) return ZERO;
  const stillCurrent = sessionStillFor(userId, resolved.client, resolved.sessionUserId);

  let pulled = 0;
  let pushed = 0;

  // Deletions first (roadmap D25), so the server stops holding them before
  // anything is pulled. Already reflected in local stats, so they don't count
  // toward a recompute.
  try {
    await pushDeletions(userId, resolved.client, stillCurrent);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] delete push failed:', errorForLog(e));
  }

  // The account changed while the deletions went: the rest of this sweep
  // belongs to an account that is no longer signed in.
  if (!(await stillCurrent())) return ZERO;

  try {
    pulled = await pullRemote(userId, resolved.client, resolved.cursorStore);
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
 */
export async function pushNow(
  userId: string | null,
  deps?: SyncDeps,
  maxWaitMs: number = DEFAULT_WAIT_MS,
): Promise<number> {
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
    const resolved = resolveDeps(deps);
    if (!resolved.client) return;
    const stillCurrent = sessionStillFor(userId, resolved.client, resolved.sessionUserId);
    try {
      pushed += await pushDeletions(userId, resolved.client, stillCurrent);
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
  await settleWithin(run, maxWaitMs);
  return pushed;
}

/**
 * Stop syncing `userId` before its rows leave the phone: no sweep starts for
 * it, a running one writes nothing more to the phone (no pulled row, no
 * cursor, no recompute) and sends nothing more, and this waits for it to
 * finish, at most `maxWaitMs` (default 10 s). A sweep still waiting on the
 * network after that writes nothing when its answer comes. Undone by
 * `resumeSyncFor` (the session didn't end after all, or the account signed in
 * again). Never throws.
 */
export async function stopSyncFor(userId: string, maxWaitMs: number = DEFAULT_WAIT_MS): Promise<void> {
  stoppedUsers.add(userId);
  const running = inflight.get(userId);
  if (running) await settleWithin(running, maxWaitMs);
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
}

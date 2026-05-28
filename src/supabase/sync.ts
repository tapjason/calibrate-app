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
//
// `syncNow` orchestrates pull → push, then asks statsStore to recompute iff
// anything actually changed. Every failure is logged with console.warn and
// swallowed — sync is non-critical and must never break the offline loop.
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
  listDirtyPredictions,
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
}

export interface SyncDeps {
  /** Override the SupabaseClient (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Cursor store for pull progress; defaults to AsyncStorage-backed. */
  cursorStore?: CursorStore;
  /** Recompute derived stats after sync — defaults to statsStore.recomputeForUser. */
  recompute?: (userId: string) => Promise<void>;
}

const ZERO: SyncResult = { pulled: 0, pushed: 0 };
const EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';

// A modest cap so a one-shot pull doesn't pull a million rows. Hitting this
// just means the next sweep continues — no data loss.
const MAX_PULL_BATCH = 500;

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
  };
}

async function defaultRecompute(userId: string): Promise<void> {
  await useStatsStore.getState().recomputeForUser(userId);
}

interface ResolvedDeps {
  client: SupabaseClient | null;
  cursorStore: CursorStore;
  recompute: (userId: string) => Promise<void>;
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
    const remote = raw as PredictionWireRow;
    // Defense: RLS should already filter, but a misconfigured server could
    // return foreign rows. Skip them rather than writing them locally.
    if (remote.user_id !== userId) continue;

    const localUpdatedAt = await getPredictionUpdatedAt(remote.id);
    if (!localUpdatedAt || localUpdatedAt < remote.updated_at) {
      await upsertPredictionFromRemote(remote);
      written += 1;
    }
    if (remote.updated_at > lastSeen) lastSeen = remote.updated_at;
  }

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
 */
export async function pushDirty(
  userId: string,
  client: SupabaseClient,
): Promise<number> {
  const dirty = await listDirtyPredictions(userId);
  if (dirty.length === 0) return 0;

  const upsertBatch = async (rows: PredictionWireRow[]) => {
    const { error } = await client
      .from('predictions')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  };

  try {
    await upsertBatch(dirty);
    for (const row of dirty) {
      await markPredictionSynced(row.id, row.updated_at);
    }
    return dirty.length;
  } catch (batchErr) {
    // eslint-disable-next-line no-console
    console.warn('[sync] batch push failed, falling back to per-row:', batchErr);
    let pushed = 0;
    for (const row of dirty) {
      try {
        await upsertBatch([row]);
        await markPredictionSynced(row.id, row.updated_at);
        pushed += 1;
      } catch (rowErr) {
        // eslint-disable-next-line no-console
        console.warn(`[sync] push failed for ${row.id}:`, rowErr);
      }
    }
    return pushed;
  }
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
  if (!userId || userId === LOCAL_GUEST_USER_ID) {
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

  let pulled = 0;
  let pushed = 0;

  try {
    pulled = await pullRemote(userId, resolved.client, resolved.cursorStore);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] pull failed:', e);
  }

  try {
    pushed = await pushDirty(userId, resolved.client);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[sync] push failed:', e);
  }

  if (pulled + pushed > 0) {
    try {
      await resolved.recompute(userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sync] recompute failed:', e);
    }
  }

  return { pulled, pushed };
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
}

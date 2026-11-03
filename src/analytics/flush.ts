// Pushing queued events to Postgres (L5).
//
// Mirrors src/supabase/sync.ts in shape and in temperament: batch, fall back
// per-row, swallow every error, and never let the network decide whether the
// app works. It differs in one way — a row that lands is deleted locally
// rather than flagged, because a second copy of someone's usage history on
// their own device serves nobody.
//
// A guest's funnel events go up with no id of any kind (roadmap D43, decided
// 2026-11-03), to their own table, so the funnel counts people who never sign
// in: before, the aha rate measured only the signed-in, which reads high. The
// rest of what a guest records waits on the device: on sign-in,
// migrateGuestDataToUser hands it to the new account with the predictions.

import type { SupabaseClient } from '@supabase/supabase-js';

import { GUEST_ANALYTICS } from '@/constants/app';
import {
  deleteEvents,
  listUnsyncedEvents,
  type QueuedEvent,
} from '@/db/analytics';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { useSettingsStore } from '@/store/settingsStore';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';

import { GUEST_EVENT_NAMES } from './events';

/** Rows per request. Small — these are tiny rows and this is background work. */
const BATCH_SIZE = 100;

export interface FlushDeps {
  /** Override the client (tests). Null means "no client available". */
  client?: SupabaseClient | null;
  /** Override GUEST_ANALYTICS (tests). */
  guests?: boolean;
}

interface EventWireRow {
  id: string;
  user_id: string;
  name: string;
  props: Record<string, number | boolean | string>;
  created_at: string;
}

const toWire = (e: QueuedEvent): EventWireRow => ({
  id: e.id,
  user_id: e.user_id,
  name: e.name,
  props: e.props,
  created_at: e.created_at,
});

/** A guest's row: no user id, and nothing else that could stand for one. */
type GuestWireRow = Omit<EventWireRow, 'user_id'>;

const toGuestWire = (e: QueuedEvent): GuestWireRow => ({
  id: e.id,
  name: e.name,
  props: e.props,
  created_at: e.created_at,
});

// One sweep at a time. Foreground and post-sign-in can fire together, and two
// concurrent sweeps would push the same rows twice.
let inflight: Promise<number> | null = null;

/**
 * Push queued events. Returns how many were accepted by the server.
 *
 * Never throws. Returns 0 for no user, an opted-out user, a guest while
 * GUEST_ANALYTICS is off, an unconfigured Supabase, an empty queue, or any
 * failure — all of which are ordinary.
 */
export function flushEvents(userId: string | null, deps?: FlushDeps): Promise<number> {
  if (inflight) return inflight;
  inflight = run(userId, deps).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(userId: string | null, deps?: FlushDeps): Promise<number> {
  try {
    if (!userId) return 0;
    const guest = userId === LOCAL_GUEST_USER_ID;
    if (guest && !(deps?.guests ?? GUEST_ANALYTICS)) return 0;
    if (!useSettingsStore.getState().analyticsEnabled) return 0;

    const client =
      deps?.client !== undefined
        ? deps.client
        : isSupabaseConfigured()
          ? getSupabaseClient()
          : null;
    if (!client) return 0;

    const queued = await listUnsyncedEvents(
      userId,
      BATCH_SIZE,
      guest ? GUEST_EVENT_NAMES : undefined,
    );
    if (queued.length === 0) return 0;

    const rows: Array<EventWireRow | GuestWireRow> = queued.map(guest ? toGuestWire : toWire);
    const table = guest ? 'guest_analytics_events' : 'analytics_events';
    // Insert, not upsert. The table is append-only by policy — there is no
    // update grant, deliberately, because an event log the client can rewrite
    // is not a log. Idempotency comes from the client-generated primary key
    // instead: a retry of a row the server already has fails with a duplicate
    // key, which is success as far as this queue is concerned.
    const insert = async (batch: Array<EventWireRow | GuestWireRow>) => {
      const { error } = await client.from(table).insert(batch);
      if (error) throw error;
    };

    try {
      await insert(rows);
      await deleteEvents(rows.map((r) => r.id));
      return rows.length;
    } catch (batchErr) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] batch push failed, falling back to per-row:', batchErr);
      let pushed = 0;
      const done: string[] = [];
      for (const row of rows) {
        try {
          await insert([row]);
          done.push(row.id);
          pushed += 1;
        } catch (rowErr) {
          if (isDuplicate(rowErr)) {
            // Already delivered; a response we never saw. Drop it locally.
            done.push(row.id);
          }
          // Anything else stays queued. The next sweep retries, and the queue
          // is capped so it cannot grow without bound.
        }
      }
      await deleteEvents(done);
      return pushed;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] flush failed:', e);
    return 0;
  }
}

/** Postgres unique-violation, i.e. this row is already on the server. */
function isDuplicate(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
  );
}

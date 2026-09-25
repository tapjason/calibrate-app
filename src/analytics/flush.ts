// Pushing queued events to Postgres (L5).
//
// Mirrors src/supabase/sync.ts in shape and in temperament: batch, fall back
// per-row, swallow every error, and never let the network decide whether the
// app works. It differs in one way — a row that lands is deleted locally
// rather than flagged, because a second copy of someone's usage history on
// their own device serves nobody.
//
// Guests never flush. A guest has no Supabase row to own the events, and
// analytics that can't be attributed is analytics not worth collecting. What
// a guest records waits on the device: on sign-in, migrateGuestDataToUser
// hands it to the new account along with the predictions, so the Warmup —
// which always runs before any sign-in — is still counted.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  deleteEvents,
  listUnsyncedEvents,
  type QueuedEvent,
} from '@/db/analytics';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { useSettingsStore } from '@/store/settingsStore';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';

/** Rows per request. Small — these are tiny rows and this is background work. */
const BATCH_SIZE = 100;

export interface FlushDeps {
  /** Override the client (tests). Null means "no client available". */
  client?: SupabaseClient | null;
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

// One sweep at a time. Foreground and post-sign-in can fire together, and two
// concurrent sweeps would push the same rows twice.
let inflight: Promise<number> | null = null;

/**
 * Push queued events. Returns how many were accepted by the server.
 *
 * Never throws. Returns 0 for a guest, an opted-out user, an unconfigured
 * Supabase, an empty queue, or any failure — all of which are ordinary.
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
    if (!userId || userId === LOCAL_GUEST_USER_ID) return 0;
    if (!useSettingsStore.getState().analyticsEnabled) return 0;

    const client =
      deps?.client !== undefined
        ? deps.client
        : isSupabaseConfigured()
          ? getSupabaseClient()
          : null;
    if (!client) return 0;

    const queued = await listUnsyncedEvents(userId, BATCH_SIZE);
    if (queued.length === 0) return 0;

    const rows = queued.map(toWire);
    // Insert, not upsert. The table is append-only by policy — there is no
    // update grant, deliberately, because an event log the client can rewrite
    // is not a log. Idempotency comes from the client-generated primary key
    // instead: a retry of a row the server already has fails with a duplicate
    // key, which is success as far as this queue is concerned.
    const insert = async (batch: EventWireRow[]) => {
      const { error } = await client.from('analytics_events').insert(batch);
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

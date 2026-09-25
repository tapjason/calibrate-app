// Analytics queue persistence (L2). Write-then-forget storage for the event
// pipe; the pushing lives in src/analytics/flush.ts.
//
// Two properties this layer owns:
//
//   1. **The queue is bounded.** An install that never signs in, or never gets
//      network, would otherwise accumulate rows forever. Every TRIM_INTERVAL
//      inserts the queue is trimmed to MAX_QUEUED, dropping oldest-first —
//      recent behavior is what the metrics are about, and unbounded local
//      growth is a real bug on a phone.
//   2. **Nothing here throws at a caller.** Analytics is the least important
//      thing in the app; a failed insert must not take down a save.

import { getDb } from './client';

/**
 * Ceiling on unsynced rows. Roughly a year of heavy use — the queue only grows
 * when pushing fails, so anything near this means the pipe has been broken for
 * a long time and the oldest rows are the least interesting.
 */
export const MAX_QUEUED = 2_000;

/**
 * How many inserts between trims. Trimming on every insert costs a scan on the
 * write path of something that is supposed to be free — logging a prediction
 * must never wait on analytics housekeeping. The queue can therefore overshoot
 * the cap by up to this many rows, which is a few kilobytes.
 */
export const TRIM_INTERVAL = 50;

let insertsSinceTrim = 0;

/** Test-only: shrink the cap so the trim can be exercised without 2,000 rows. */
let queueCap = MAX_QUEUED;
export function __setQueueCapForTests(cap: number | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setQueueCapForTests is only allowed when NODE_ENV=test');
  }
  queueCap = cap ?? MAX_QUEUED;
  insertsSinceTrim = 0;
}

/** Drop all but the newest `max` unsynced events. */
export async function trimQueue(max: number = queueCap): Promise<void> {
  try {
    await getDb().run(
      `DELETE FROM analytics_events
        WHERE synced = 0
          AND id NOT IN (
            SELECT id FROM analytics_events WHERE synced = 0
             ORDER BY created_at DESC, id DESC LIMIT ?
          )`,
      [max],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] trim failed:', e);
  }
}

export interface QueuedEvent {
  id: string;
  user_id: string;
  name: string;
  /** Already-sanitized property bag. */
  props: Record<string, number | boolean | string>;
  created_at: string;
}

interface EventRow {
  id: string;
  user_id: string;
  name: string;
  props_json: string;
  created_at: string;
}

function parseRow(row: EventRow): QueuedEvent {
  let props: QueuedEvent['props'] = {};
  try {
    const parsed: unknown = JSON.parse(row.props_json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      props = parsed as QueuedEvent['props'];
    }
  } catch {
    // A corrupt bag costs one event's detail, not the event.
  }
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    props,
    created_at: row.created_at,
  };
}

/** Append an event to the queue. Returns false if it could not be stored. */
export async function enqueueEvent(event: QueuedEvent): Promise<boolean> {
  try {
    const db = getDb();
    await db.run(
      `INSERT INTO analytics_events (id, user_id, name, props_json, created_at, synced)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        event.id,
        event.user_id,
        event.name,
        JSON.stringify(event.props ?? {}),
        event.created_at,
      ],
    );
    insertsSinceTrim += 1;
    if (insertsSinceTrim >= TRIM_INTERVAL) {
      insertsSinceTrim = 0;
      await trimQueue();
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] enqueue failed:', e);
    return false;
  }
}

/**
 * The oldest unsynced events owned by `userId`, up to `limit`. Empty on any
 * failure.
 *
 * Scoped to one user because only that user's session can insert them: RLS
 * checks `auth.uid() = user_id`. An unscoped read handed the flush another
 * owner's rows (a guest's, or a previous account's on a shared phone), every
 * one of which the server refuses — and since refused rows stay queued and
 * this reads oldest-first, the same unsendable batch came back on every
 * sweep and the signed-in user's own events never went out.
 */
export async function listUnsyncedEvents(
  userId: string,
  limit: number,
): Promise<QueuedEvent[]> {
  try {
    const rows = await getDb().all<EventRow>(
      `SELECT id, user_id, name, props_json, created_at
         FROM analytics_events
        WHERE synced = 0 AND user_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
      [userId, limit],
    );
    return rows.map(parseRow);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] read failed:', e);
    return [];
  }
}

/**
 * Delete events that were pushed successfully.
 *
 * Deleted rather than flagged: once a row is on the server, keeping a second
 * copy of someone's usage history on their device serves nobody.
 */
export async function deleteEvents(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const placeholders = ids.map(() => '?').join(',');
    await getDb().run(
      `DELETE FROM analytics_events WHERE id IN (${placeholders})`,
      [...ids],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] delete failed:', e);
  }
}

/** How many events are waiting. Used by tests and the flush's early exit. */
export async function countUnsyncedEvents(): Promise<number> {
  try {
    const row = await getDb().get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM analytics_events WHERE synced = 0`,
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Drop everything. Used when the user turns analytics off. */
export async function clearEvents(): Promise<void> {
  try {
    await getDb().run(`DELETE FROM analytics_events`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] clear failed:', e);
  }
}

// Pushing queued events to Postgres (L5).
//
// Mirrors src/supabase/sync.ts in shape and in temperament: batch, fall back
// per-row, swallow every error, and never let the network decide whether the
// app works. It differs in one way — a row that lands is deleted locally
// rather than flagged, because a second copy of someone's usage history on
// their own device serves nobody. A refusal the server would repeat for every
// row (a budget, a size limit, a read-only database) ends the sweep with
// nothing retried, and a row the server can never accept is dropped (see
// outcomeOf below).
//
// A guest's funnel events go up with no id of any kind (roadmap D43, decided
// 2026-11-03), to their own table, so the funnel counts people who never sign
// in: before, the aha rate measured only the signed-in, which reads high. The
// rest of what a guest records waits on the device: on sign-in,
// migrateGuestDataToUser hands it to the new account with the predictions.
//
// When anything may go up, checked here for every caller, and all of it again
// before each request (`maySend`), so a flush under way stops when any of it
// changes:
//   - Only while `uploadsMayStart()` (src/store/ageStore.ts; roadmap D70):
//     Apple has answered on a launch that asks, and the phone isn't
//     local-only under the under-13 rule.
//   - With Usage stats on (`selectUsageStatsOn`: off by default on a phone
//     whose region is Canada, until the person turns them on): the switch can
//     be turned off on the sign-in screen while a flush is reading its queue.
//   - A guest's, only once the line about usage counts has been shown on this
//     phone (`usageNoticeShownAt`, D69 (b)). The root layout checked it
//     before each flush (`usageCountsMayGoUp`); here it holds for any caller,
//     src/age/localOnly.ts's included.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  deleteEvents,
  listUnsyncedEvents,
  type QueuedEvent,
} from '@/db/analytics';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { uploadsMayStart } from '@/store/ageStore';
import { selectUsageStatsOn, useSettingsStore } from '@/store/settingsStore';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/client';

import { GUEST_EVENT_NAMES } from './events';

/**
 * Rows per request. Small — these are tiny rows and this is background work.
 * Never above 100: migration 010 (supabase/migrations/010_public_key_limits.sql)
 * refuses a guest insert of more than 100 rows with PT413, and a batch it
 * refuses for its size is never sent again row by row (below).
 */
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
 * Whether this sweep may send now: uploads may start (the under-13 rule,
 * D70), Usage stats is on, and for a guest the line about usage counts has
 * been shown (D69 (b)). Read fresh each time: checked before the queue is
 * read and again before every request.
 */
function maySend(guest: boolean): boolean {
  if (!uploadsMayStart()) return false;
  const settings = useSettingsStore.getState();
  if (!selectUsageStatsOn(settings)) return false;
  return !(guest && settings.usageNoticeShownAt === null);
}

/**
 * Push queued events. Returns how many were accepted by the server.
 *
 * Never throws. Returns 0 for no user, an opted-out user, an unconfigured
 * Supabase, an empty queue, or any failure — all of which are ordinary. And
 * 0, sending nothing, until `uploadsMayStart()` (the under-13 rule, D70), and
 * for a guest until the line about usage counts has been shown (D69 (b)).
 */
export function flushEvents(userId: string | null, deps?: FlushDeps): Promise<number> {
  if (!uploadsMayStart()) return Promise.resolve(0);
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
    // A guest's counts go up only once the line about them has been shown on
    // this phone (D69 (b)); an account's sign-in screen says what goes up.
    if (!maySend(guest)) return 0;

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
    //
    // Null when the server took the rows; otherwise what it said. Never throws.
    const insert = async (batch: Array<EventWireRow | GuestWireRow>): Promise<Refusal | null> => {
      try {
        const { error, status } = await client.from(table).insert(batch);
        return error ? refusalOf(error, status) : null;
      } catch (e) {
        return refusalOf(e, undefined);
      }
    };

    // The rule may have come on, or Usage stats gone off, while the queue was
    // read (D70).
    if (!maySend(guest)) return 0;
    const batchRefusal = await insert(rows);
    if (!batchRefusal) {
      await deleteEvents(rows.map((r) => r.id));
      return rows.length;
    }
    if (outcomeOf(batchRefusal) === 'stop') {
      // The server would refuse each row the same way: no row-by-row retry,
      // which would only spend a hundred requests on the same answer.
      // Everything stays queued for a later sweep.
      // eslint-disable-next-line no-console
      console.warn('[analytics] push refused for now; events stay queued:', refusalForLog(batchRefusal));
      return 0;
    }

    // eslint-disable-next-line no-console
    console.warn('[analytics] batch push failed, falling back to per-row:', batchRefusalForLog(batchRefusal));
    let pushed = 0;
    const done: string[] = [];
    for (const row of rows) {
      // Stops before the next request once the rule applies (D70) or Usage
      // stats goes off; what landed is cleared below, the rest stays queued.
      if (!maySend(guest)) break;
      const refusal = await insert([row]);
      if (!refusal) {
        done.push(row.id);
        pushed += 1;
        continue;
      }
      const outcome = outcomeOf(refusal);
      if (outcome === 'stop') {
        // This row and the rest stay queued; what landed is cleared below.
        // eslint-disable-next-line no-console
        console.warn('[analytics] push refused for now; events stay queued:', refusalForLog(refusal));
        break;
      }
      if (outcome === 'delivered') {
        // Already delivered; a response we never saw. Drop it locally.
        done.push(row.id);
      } else if (outcome === 'drop') {
        // The server will refuse this row every time. Only the code goes to
        // the log: a refused row's details repeat the row.
        // eslint-disable-next-line no-console
        console.warn('[analytics] dropped an event the server can never accept:', refusalForLog(refusal));
        done.push(row.id);
      }
      // Anything else stays queued. The next sweep retries, and the queue is
      // capped so it cannot grow without bound.
    }
    await deleteEvents(done);
    return pushed;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] flush failed:', errorForLog(e));
    return 0;
  }
}

/**
 * An error as the device log may carry it: its code and message. Never the
 * object: a Postgres error's `details` repeat the failing row, the user id
 * included (security review, 2026-11-18).
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
 * What the server said when it didn't take an insert: the error's code (the
 * Postgres SQLSTATE, or PostgREST's PTxyz / PGRSTxxx) and message, and the
 * HTTP status when there was a response. Never the error's details or hint,
 * which can repeat the row.
 */
interface Refusal {
  code: string | null;
  message: string | null;
  status: number | null;
}

function refusalOf(error: unknown, status: unknown): Refusal {
  const { code, message } =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  return {
    code: typeof code === 'string' && code.length > 0 ? code : null,
    message: typeof message === 'string' ? message : null,
    // supabase-js reports 0 when there was no response at all.
    status: typeof status === 'number' && status > 0 ? status : null,
  };
}

/** The code, or the HTTP status when there is no code, for the log. */
function refusalForLog(refusal: Refusal): string {
  if (refusal.code) return refusal.code;
  if (refusal.status !== null) return `HTTP ${refusal.status}`;
  return 'unknown error';
}

/**
 * A refused batch for the log: its code and message, or the code alone when
 * the message can quote a row's own values (a Postgres data exception, class
 * 22: `invalid input syntax for type uuid: "…"`) or a row will be dropped.
 */
function batchRefusalForLog(refusal: Refusal): string {
  const quotesInput = refusal.code !== null && refusal.code.startsWith('22');
  return quotesInput || outcomeOf(refusal) === 'drop' ? refusalForLog(refusal) : errorForLog(refusal);
}

/**
 * The server will refuse anything sent now, so this sweep stops and every row
 * stays queued:
 *   PT413  more than 100 rows in one guest insert (migration 010);
 *   PT429  the guest table's daily budget is used up, until midnight UTC
 *          (migration 010);
 *   25006  the database is read-only (Postgres read_only_sql_transaction;
 *          Supabase does this at 95% disk use, or as a usage restriction).
 */
const STOP_CODES: ReadonlySet<string> = new Set(['PT413', 'PT429', '25006']);

/**
 * The same, by HTTP status: 402, Supabase's answer to every API request while
 * a project is restricted under its Fair Use Policy, and 429, a rate limit in
 * front of the database (PT429 also arrives as 429).
 */
const STOP_STATUSES: ReadonlySet<number> = new Set([402, 429]);

/**
 * This row can never be accepted, so it is dropped from the queue:
 *   23514  a CHECK the row breaks (the props rule, the event name's shape or
 *          list, the id's length: migrations 005, 007 and 010);
 *   22P02  invalid input for a column's type (a user id that isn't a uuid);
 *   22007  a created_at that isn't a timestamp;
 *   22008  a created_at out of range.
 */
const DROP_CODES: ReadonlySet<string> = new Set(['23514', '22P02', '22007', '22008']);

/** Postgres unique-violation, i.e. this row is already on the server. */
const DUPLICATE_CODE = '23505';

function outcomeOf(refusal: Refusal): 'stop' | 'delivered' | 'drop' | 'retry' {
  if (refusal.code !== null && STOP_CODES.has(refusal.code)) return 'stop';
  if (refusal.status !== null && STOP_STATUSES.has(refusal.status)) return 'stop';
  if (refusal.code === DUPLICATE_CODE) return 'delivered';
  if (refusal.code !== null && DROP_CODES.has(refusal.code)) return 'drop';
  return 'retry';
}

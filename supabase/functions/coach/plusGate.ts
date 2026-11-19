// The Coach's Plus gate, as a decision: does the `entitlements` row say Plus,
// and if not, does RevenueCat (step 189)?
//
// Plain TypeScript with no Deno imports, like
// revenuecat-webhook/entitlementFromEvent.ts, so Jest can test it
// (its test file sits beside it). index.ts reads the row, hands this the lookup, and
// does what the outcome says.
//
// Why the lookup: the row is written by the RevenueCat webhook, and the
// webhook can miss a purchase. A TRANSFER names users but carries no
// entitlement; a purchase made under an anonymous RevenueCat id lands under no
// Supabase user; an account deleted and made again has a new id. Each left a
// paying subscriber with no row and the Coach answering 403 (TestFlight,
// 2026-11-17). When the row doesn't say Plus, the gate asks RevenueCat itself.
//
// Fail closed: only a lookup that says `plus` opens the gate. `none`, any
// error, and a lookup that throws all keep the 403. The lookup is never a way
// to Plus that RevenueCat didn't vouch for.

import type { EntitlementWrite, PlusLookup } from '../_shared/revenuecatLookup.ts';

/**
 * How far behind "now" the row written after a lookup puts its event cursor
 * (`last_event_ms`, migration 004).
 *
 * The cursor says "this row reflects RevenueCat's events up to here", and
 * apply_entitlement_event drops any webhook event at or before it. A lookup
 * isn't an event: it reads RevenueCat's state as its API reports it, and an
 * event RevenueCat sent a moment ago (a cancellation, a refund) may still be
 * on its way to the webhook, or not yet in that state. With "now" as the
 * cursor, such an event arriving a second later was dropped, and the row said
 * Plus until its expiry. A minute behind lets those land.
 *
 * The trade-off: an event from that last minute that says less than the
 * lookup did (an older renewal, say) can overwrite the row. That costs at most
 * one more lookup on the next Coach call, which writes the row again; it
 * never opens the gate, which only RevenueCat's own yes does. An event older
 * than a minute is still dropped, and the lookup's answer already reflects it.
 */
export const LOOKUP_CURSOR_LAG_MS = 60_000;

/** How long an isolate remembers that RevenueCat said "no Plus" for a user. */
export const NONE_MEMORY_TTL_MS = 10 * 60_000;
/** The most users one isolate remembers; the oldest are forgotten first. */
export const NONE_MEMORY_MAX_ENTRIES = 2_000;

/**
 * Per-isolate memory of RevenueCat's "no Plus" answers.
 *
 * Without it, every call from a signed-in free user (up to the burst limit)
 * cost one or two RevenueCat requests, and the key's budget (480 a minute) is
 * shared with the webhook's TRANSFER lookups: one account could spend it.
 * Only a definite "none" is remembered, never an error, and a "plus" answer
 * forgets it (the row is written then anyway). The cost: someone who buys
 * Plus within ten minutes of a refused Coach call, and whose purchase the
 * webhook misses, waits out the rest of those ten minutes on that isolate.
 * The webhook's own row opens the gate at once, since the row is read first.
 */
export interface NoneMemory {
  /** Whether a fresh "none" is remembered for this user at `now`. */
  has(userId: string, now: number): boolean;
  remember(userId: string, now: number): void;
  forget(userId: string): void;
  /** Entries held, expired ones included until they are swept. */
  readonly size: number;
}

export function createNoneMemory(
  ttlMs: number = NONE_MEMORY_TTL_MS,
  maxEntries: number = NONE_MEMORY_MAX_ENTRIES,
): NoneMemory {
  // Insertion order is age order: remember() re-inserts, so the first key is
  // always the oldest entry.
  const until = new Map<string, number>();
  return {
    has(userId, now) {
      const expiry = until.get(userId);
      if (expiry === undefined) return false;
      if (expiry > now) return true;
      until.delete(userId);
      return false;
    },
    remember(userId, now) {
      until.delete(userId);
      for (const [key, expiry] of until) {
        if (until.size < maxEntries && expiry > now) break;
        until.delete(key);
      }
      until.set(userId, now + ttlMs);
    },
    forget(userId) {
      until.delete(userId);
    },
    get size() {
      return until.size;
    },
  };
}

/** The columns of `public.entitlements` the gate reads. */
export interface EntitlementRow {
  is_plus?: unknown;
  expires_at?: unknown;
}

/**
 * Does the row alone grant Plus at `now`? Absence means free (CLAUDE.md:
 * absence defaults to free, never Plus); an expiry that doesn't parse is not
 * trusted.
 */
export function rowGrantsPlus(row: EntitlementRow | null | undefined, now: number): boolean {
  if (!row || row.is_plus !== true) return false;
  if (row.expires_at === null || row.expires_at === undefined) return true;
  if (typeof row.expires_at !== 'string') return false;
  const ms = Date.parse(row.expires_at);
  return Number.isFinite(ms) && ms > now;
}

export type PlusGateOutcome =
  | { entitled: true; via: 'row' }
  | {
      entitled: true;
      via: 'lookup';
      /**
       * The row the lookup proved, for `apply_entitlement_event`, with its
       * cursor LOOKUP_CURSOR_LAG_MS behind `now`. If the write fails the
       * request is still served.
       */
      write: EntitlementWrite;
    }
  | {
      entitled: false;
      /** For the server log only; the caller answers 403 `not_entitled`. */
      reason: string;
    };

/**
 * Decide the gate. `lookup` is called only when the row doesn't grant Plus,
 * so a subscriber with a good row never costs a RevenueCat call, and not
 * while `memory` holds a fresh "none" for this user.
 */
export async function decidePlusGate(
  userId: string,
  row: EntitlementRow | null | undefined,
  now: number,
  lookup: () => Promise<PlusLookup>,
  memory?: NoneMemory,
): Promise<PlusGateOutcome> {
  if (rowGrantsPlus(row, now)) return { entitled: true, via: 'row' };

  if (memory?.has(userId, now)) {
    return { entitled: false, reason: 'revenuecat: no active plus entitlement (remembered)' };
  }

  let result: PlusLookup;
  try {
    result = await lookup();
  } catch {
    // lookupPlus never throws; this keeps the gate closed if one ever does.
    return { entitled: false, reason: 'revenuecat lookup threw' };
  }

  if (result.status === 'error') {
    // Never remembered: an unreadable answer is not a "no".
    return { entitled: false, reason: `revenuecat lookup failed (${result.reason})` };
  }
  if (result.status === 'none') {
    memory?.remember(userId, now);
    return { entitled: false, reason: 'revenuecat: no active plus entitlement' };
  }
  memory?.forget(userId);

  // The lookup already drops lapsed entitlements; checked again here because
  // this is the line that opens a paid endpoint.
  if (result.expiresAt !== null) {
    const ms = Date.parse(result.expiresAt);
    if (!Number.isFinite(ms) || ms <= now) {
      return { entitled: false, reason: 'revenuecat: plus already expired' };
    }
  }

  return {
    entitled: true,
    via: 'lookup',
    write: {
      userId,
      isPlus: true,
      source: result.source,
      expiresAt: result.expiresAt,
      eventMs: now - LOOKUP_CURSOR_LAG_MS,
    },
  };
}

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
       * The row the lookup proved, for `apply_entitlement_event`, with `now`
       * as its cursor. If the write fails the request is still served.
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
 * so a subscriber with a good row never costs a RevenueCat call.
 */
export async function decidePlusGate(
  userId: string,
  row: EntitlementRow | null | undefined,
  now: number,
  lookup: () => Promise<PlusLookup>,
): Promise<PlusGateOutcome> {
  if (rowGrantsPlus(row, now)) return { entitled: true, via: 'row' };

  let result: PlusLookup;
  try {
    result = await lookup();
  } catch {
    // lookupPlus never throws; this keeps the gate closed if one ever does.
    return { entitled: false, reason: 'revenuecat lookup threw' };
  }

  if (result.status === 'error') {
    return { entitled: false, reason: `revenuecat lookup failed (${result.reason})` };
  }
  if (result.status === 'none') {
    return { entitled: false, reason: 'revenuecat: no active plus entitlement' };
  }

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
      eventMs: now,
    },
  };
}

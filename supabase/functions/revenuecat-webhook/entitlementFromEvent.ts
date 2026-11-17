// Pure decision logic for the RevenueCat webhook: one event in, one
// entitlement decision out.
//
// It lives in its own file, free of Deno imports, for one reason — it is the
// part that can be wrong in ways nobody notices until a paying subscriber
// can't use what they bought, and this way Jest can test it directly
// (`entitlementFromEvent.test.ts`) even though the function around it only
// ever runs on Deno.
//
// Shape of the truth this encodes: **the expiry decides, not the event name.**
// RevenueCat sends CANCELLATION the moment someone turns off auto-renew, which
// is weeks before their access should end; it sends BILLING_ISSUE during a
// grace period in which access continues. Revoking on either would take away
// something the user has paid for. So the only events that revoke outright are
// the ones that mean access is gone right now, and everything else is decided
// by whether the entitlement's expiry is still in the future.
//
// One event carries no entitlement at all: TRANSFER (a purchase moving from
// one app user id to another) names only the users, in `transferred_from` and
// `transferred_to`. For it the decision is `lookup`: the function asks
// RevenueCat what each named Supabase user owns now (../_shared/
// revenuecatLookup.ts) and writes that (step 189).

// The .ts extension is required by Deno and rejected by the project's
// tsconfig (TS5097); the types still resolve, and Jest resolves the path
// as written.
import type { EntitlementSource } from '../_shared/revenuecatLookup.ts';
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { PLUS_ENTITLEMENT_ID, UUID_RE } from '../_shared/revenuecatLookup.ts';

export type { EntitlementSource };
/** The lookup key. Defined in ../_shared/revenuecatLookup.ts; re-exported here. */
export { PLUS_ENTITLEMENT_ID };

/** Mirrors PRODUCT_IDS in src/billing/revenuecat.ts. Keep in lockstep. */
export const PRODUCT_IDS = {
  monthly: 'calibrate_plus_monthly',
  annual: 'calibrate_plus_annual',
  lifetime: 'calibrate_plus_lifetime',
} as const;

/** Mirrors PRODUCT_ALIASES in src/billing/revenuecat.ts. Keep in lockstep. */
export const PRODUCT_ALIASES: Readonly<Record<keyof typeof PRODUCT_IDS, readonly string[]>> = {
  monthly: ['calibrate_plus_monthly_notrial'],
  annual: ['calibrate_plus_annual_2999'],
  lifetime: [],
};

/** The subset of a RevenueCat v1 webhook event this function reads. */
export interface RevenueCatEvent {
  type?: unknown;
  id?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  product_id?: unknown;
  period_type?: unknown;
  expiration_at_ms?: unknown;
  event_timestamp_ms?: unknown;
  entitlement_ids?: unknown;
  /** Deprecated single-entitlement field; still sent by older integrations. */
  entitlement_id?: unknown;
  /** 'SANDBOX' or 'PRODUCTION'. */
  environment?: unknown;
  /** TRANSFER only: the app user ids the purchase moved away from. */
  transferred_from?: unknown;
  /** TRANSFER only: the app user ids the purchase moved to. */
  transferred_to?: unknown;
}

export interface DecisionOptions {
  /**
   * Acknowledge and skip every SANDBOX event. Off by default, and it should
   * stay off through App Review: reviewers buy with sandbox accounts, so with
   * this on, a reviewer who subscribes gets a Coach that answers 403, and
   * that's a rejection. The cost of leaving it off is that TestFlight testers
   * (also sandbox) get server-side Plus, bounded by the Coach's daily ceiling.
   * Set REVENUECAT_IGNORE_SANDBOX=true on the function to turn it on.
   */
  ignoreSandbox?: boolean;
}

export interface EntitlementDecision {
  /**
   * `write` upserts the row; `ignore` acknowledges the event and does nothing;
   * `lookup` asks RevenueCat about each of `lookupUserIds` and writes what it
   * says (TRANSFER).
   */
  action: 'write' | 'ignore' | 'lookup';
  /** Why — logged server-side, and the assertion surface for tests. */
  reason: string;
  /** Supabase user id. Only present when action is `write`. */
  userId: string | null;
  isPlus: boolean;
  source: EntitlementSource;
  /** ISO string, or null for a non-expiring (lifetime) grant. */
  expiresAt: string | null;
  /** Event timestamp, used to reject out-of-order deliveries. */
  eventMs: number;
  /**
   * Supabase user ids to look up, destination first. Empty unless action is
   * `lookup`.
   */
  lookupUserIds: string[];
}

/**
 * Events that mean access is gone *now*.
 *
 * Deliberately excluded:
 *   - CANCELLATION — auto-renew off; access continues until the expiry.
 *   - BILLING_ISSUE — grace period; access continues while RevenueCat retries.
 *   - PRODUCT_CHANGE — a plan switch, with a new expiry attached.
 */
const REVOKING_TYPES = new Set(['EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED']);

/** Acknowledged and skipped: nothing about entitlement state to record. */
const IGNORED_TYPES = new Set(['TEST', 'SUBSCRIBER_ALIAS', 'INVOICE_ISSUANCE']);

const ignore = (reason: string, eventMs = 0): EntitlementDecision => ({
  action: 'ignore',
  reason,
  userId: null,
  isPlus: false,
  source: 'none',
  expiresAt: null,
  eventMs,
  lookupUserIds: [],
});

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The Supabase user ids in a TRANSFER's id list; anonymous ids and junk dropped. */
function supabaseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id));
}

function grantsPlus(event: RevenueCatEvent): boolean {
  const ids = event.entitlement_ids;
  if (Array.isArray(ids)) return ids.includes(PLUS_ENTITLEMENT_ID);
  if (typeof event.entitlement_id === 'string') {
    return event.entitlement_id === PLUS_ENTITLEMENT_ID;
  }
  // Older events carry no entitlement field at all. Fall back to the product,
  // which is the only other thing that identifies what was bought.
  return typeof event.product_id === 'string' && sourceForProduct(event.product_id) !== null;
}

function sourceForProduct(productId: string): EntitlementSource | null {
  const plans = Object.keys(PRODUCT_IDS) as (keyof typeof PRODUCT_IDS)[];
  return (
    plans.find((plan) => PRODUCT_IDS[plan] === productId || PRODUCT_ALIASES[plan].includes(productId)) ??
    null
  );
}

function sourceFor(event: RevenueCatEvent, expiresAtMs: number | null): EntitlementSource {
  const period = typeof event.period_type === 'string' ? event.period_type.toUpperCase() : '';
  // A trial is a trial whatever product backs it — same rule as the client.
  if (period === 'TRIAL' || period === 'INTRO') return 'trial';

  const fromProduct =
    typeof event.product_id === 'string' ? sourceForProduct(event.product_id) : null;
  if (fromProduct) return fromProduct;

  // Unknown product with an active entitlement: infer from whether it expires,
  // matching entitlementFromCustomerInfo in src/billing/revenuecat.ts.
  return expiresAtMs === null ? 'lifetime' : 'monthly';
}

/**
 * Decide what the entitlements row should say after this event.
 *
 * `now` is injected so the expiry comparison is testable; the caller passes
 * Date.now().
 */
export function decideFromEvent(
  body: unknown,
  now: number,
  options: DecisionOptions = {},
): EntitlementDecision {
  const event = (body as { event?: RevenueCatEvent } | null)?.event;
  if (!event || typeof event !== 'object') return ignore('no event object');

  const type = typeof event.type === 'string' ? event.type.toUpperCase() : '';
  if (!type) return ignore('event has no type');

  const eventMs = num(event.event_timestamp_ms) ?? now;

  if (IGNORED_TYPES.has(type)) return ignore(`ignored event type ${type}`, eventMs);

  // All of a sandbox user's events, revocations included: with this on, no
  // sandbox grant was ever written, so there is nothing for one to revoke.
  if (
    options.ignoreSandbox &&
    typeof event.environment === 'string' &&
    event.environment.toUpperCase() === 'SANDBOX'
  ) {
    return ignore('sandbox event ignored in this deployment', eventMs);
  }

  // A TRANSFER carries no app_user_id, product, entitlement or expiry: only
  // `transferred_from` and `transferred_to`, string arrays of app user ids
  // (RevenueCat sends it for the destination user). So it can't be decided
  // here. Each Supabase user it names is looked up in RevenueCat and written
  // as RevenueCat says, destination first; the user it moved away from is
  // looked up too, since after a transfer away that row should be free, and
  // the lookup is what says so. Anonymous ids have no row and are dropped.
  if (type === 'TRANSFER') {
    const ids = [
      ...new Set([...supabaseIds(event.transferred_to), ...supabaseIds(event.transferred_from)]),
    ];
    if (ids.length === 0) return ignore('TRANSFER names no Supabase user id', eventMs);
    return {
      action: 'lookup',
      reason: `TRANSFER: look up ${ids.length} user${ids.length === 1 ? '' : 's'} in RevenueCat`,
      userId: null,
      isPlus: false,
      source: 'none',
      expiresAt: null,
      eventMs,
      lookupUserIds: ids,
    };
  }

  // The app configures RevenueCat with the Supabase user id, so a well-formed
  // event carries one. Anything else (an anonymous id from a purchase made
  // before sign-in, most often) has no row to write. Once that purchase sits
  // under a Supabase user, a TRANSFER (above) or the Coach's own RevenueCat
  // lookup, when it finds no row, lands it (step 189).
  const appUserId =
    typeof event.app_user_id === 'string' && UUID_RE.test(event.app_user_id)
      ? event.app_user_id
      : null;
  if (!appUserId) return ignore('app_user_id is not a Supabase user id', eventMs);

  const expiresAtMs = num(event.expiration_at_ms);
  const expiresAt = expiresAtMs === null ? null : new Date(expiresAtMs).toISOString();

  if (REVOKING_TYPES.has(type)) {
    return {
      action: 'write',
      reason: `revoked by ${type}`,
      userId: appUserId,
      isPlus: false,
      source: 'none',
      expiresAt: null,
      eventMs,
      lookupUserIds: [],
    };
  }

  if (!grantsPlus(event)) {
    return ignore('event does not concern the plus entitlement', eventMs);
  }

  // A grant whose expiry has already passed is not a grant. This is what makes
  // a late-delivered RENEWAL for a period that has since ended harmless.
  const active = expiresAtMs === null || expiresAtMs > now;
  if (!active) {
    return {
      action: 'write',
      reason: `${type} with an expiry in the past`,
      userId: appUserId,
      isPlus: false,
      source: 'none',
      expiresAt: null,
      eventMs,
      lookupUserIds: [],
    };
  }

  return {
    action: 'write',
    reason: `granted by ${type}`,
    userId: appUserId,
    isPlus: true,
    source: sourceFor(event, expiresAtMs),
    expiresAt,
    eventMs,
    lookupUserIds: [],
  };
}

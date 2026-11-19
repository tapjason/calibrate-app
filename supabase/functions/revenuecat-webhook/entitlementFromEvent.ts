// Pure decision logic for the RevenueCat webhook: one event in, one
// entitlement decision out.
//
// It lives in its own file, free of Deno imports, for one reason — it is the
// part that can be wrong in ways nobody notices until a paying subscriber
// can't use what they bought, and this way Jest can test it directly
// (its test file sits beside it) even though the function around it only
// ever runs on Deno.
//
// Shape of the truth this encodes: **a closed list of event types, each with
// one way to be decided** (security review, 2026-11-18).
//
//   - Grants (INITIAL_PURCHASE, RENEWAL, …): the expiry decides. A grant whose
//     expiry has passed writes free. A grant with NO expiry is believed only
//     from NON_RENEWING_PURCHASE (the lifetime product); on any other type a
//     missing expiry can't be told from a malformed event, so it is looked up.
//   - EXPIRATION revokes: access is gone now.
//   - CANCELLATION, REFUND_REVERSED, TEMPORARY_ENTITLEMENT_GRANT and
//     PURCHASE_REDEEMED are looked up: the function asks RevenueCat what the
//     user owns now (../_shared/revenuecatLookup.ts) and writes exactly that.
//     CANCELLATION is the reason. RevenueCat has no REFUND event: a refund
//     arrives as CANCELLATION with cancel_reason CUSTOMER_SUPPORT, for a
//     subscription or a lifetime purchase alike, and a lifetime's
//     expiration_at_ms is null. Decided from its payload, a refunded lifetime
//     read as a non-expiring grant and was written as Plus for ever. A
//     CANCELLATION can also be auto-renew turned off, with access running to
//     the expiry, and a refund can leave a subscription running; only
//     RevenueCat's answer now tells them apart.
//   - TRANSFER names users, not an entitlement: each named Supabase user is
//     looked up (step 189).
//   - Everything else, known or not, is acknowledged and writes nothing. An
//     event type added to RevenueCat later can't grant Plus by carrying a
//     product id.
//
// A lookup that fails answers 500, so RevenueCat retries. For a CANCELLATION
// that looks like the end of access (a refund, or no expiry left), the
// function writes free first: a refund must not stay Plus because RevenueCat's
// API was down (`failClosed`).

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
  /**
   * CANCELLATION only: UNSUBSCRIBE, BILLING_ERROR, DEVELOPER_INITIATED,
   * PRICE_INCREASE, CUSTOMER_SUPPORT (a refund) or UNKNOWN.
   */
  cancel_reason?: unknown;
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
   * says (TRANSFER, CANCELLATION and the other looked-up types).
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
  /**
   * `lookup` only. When a lookup fails, write free for that user before
   * answering 500 (RevenueCat retries, and the retry's lookup writes the
   * truth). Set for a CANCELLATION that looks like the end of access, so a
   * refund can't stay Plus through a RevenueCat outage. Otherwise a failed
   * lookup writes nothing.
   */
  failClosed: boolean;
}

/**
 * Events that mean access is gone *now*. Not SUBSCRIPTION_PAUSED (Google Play
 * only; RevenueCat: "Don't revoke access on this event. Revoke access only on
 * EXPIRATION") and not REFUND, which RevenueCat never sends (a refund is a
 * CANCELLATION, looked up below).
 */
const REVOKING_TYPES = new Set(['EXPIRATION']);

/**
 * Decided by the payload's expiry. BILLING_ISSUE is here because access
 * continues through a grace period, whose end is its expiry; once that has
 * passed it writes free.
 */
const GRANTING_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'BILLING_ISSUE',
  'SUBSCRIPTION_EXTENDED',
]);

/**
 * The only type whose payload is believed without an expiry: a non-renewing
 * purchase (the lifetime product) has none. RevenueCat: expiration_at_ms "can
 * be null for non-subscription purchases or lifetime products".
 */
const NON_EXPIRING_GRANT_TYPES = new Set(['NON_RENEWING_PURCHASE']);

/**
 * Decided by asking RevenueCat what the app user owns now.
 *   - CANCELLATION: a refund (cancel_reason CUSTOMER_SUPPORT) or auto-renew
 *     off; the payload can't say whether access continues.
 *   - REFUND_REVERSED: access may be back; the payload doesn't say for what.
 *   - TEMPORARY_ENTITLEMENT_GRANT: a grant of at most 24 hours during a store
 *     outage, with "less information than a regular purchase event".
 *   - PURCHASE_REDEEMED: a web purchase attached to an app user id; the app
 *     sells none, so whatever it carries is checked first.
 */
const LOOKUP_TYPES = new Set([
  'CANCELLATION',
  'REFUND_REVERSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'PURCHASE_REDEEMED',
]);

/** Known, acknowledged and skipped: nothing about entitlement state to record. */
const IGNORED_TYPES = new Set([
  'TEST',
  'SUBSCRIBER_ALIAS',
  'INVOICE_ISSUANCE',
  'SUBSCRIPTION_PAUSED',
  'VIRTUAL_CURRENCY_TRANSACTION',
  'EXPERIMENT_ENROLLMENT',
  'PRICE_INCREASE_CONSENT_REQUIRED',
  'PRICE_INCREASE_CONSENT_APPROVED',
]);

const ignore = (reason: string, eventMs = 0): EntitlementDecision => ({
  action: 'ignore',
  reason,
  userId: null,
  isPlus: false,
  source: 'none',
  expiresAt: null,
  eventMs,
  lookupUserIds: [],
  failClosed: false,
});

const lookup = (
  reason: string,
  userIds: string[],
  eventMs: number,
  failClosed = false,
): EntitlementDecision => ({
  action: 'lookup',
  reason,
  userId: null,
  isPlus: false,
  source: 'none',
  expiresAt: null,
  eventMs,
  lookupUserIds: userIds,
  failClosed,
});

const write = (
  reason: string,
  userId: string,
  eventMs: number,
  grant: { isPlus: true; source: EntitlementSource; expiresAt: string | null } | null,
): EntitlementDecision => ({
  action: 'write',
  reason,
  userId,
  isPlus: grant !== null,
  source: grant?.source ?? 'none',
  expiresAt: grant?.expiresAt ?? null,
  eventMs,
  lookupUserIds: [],
  failClosed: false,
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
    return lookup(
      `TRANSFER: look up ${ids.length} user${ids.length === 1 ? '' : 's'} in RevenueCat`,
      ids,
      eventMs,
    );
  }

  // A closed list. A type this function doesn't know (RevenueCat adds them)
  // is acknowledged and writes nothing, whatever product or entitlement it
  // carries: an unknown event must never be a way to Plus.
  if (!GRANTING_TYPES.has(type) && !REVOKING_TYPES.has(type) && !LOOKUP_TYPES.has(type)) {
    return ignore(`unknown event type ${type}`, eventMs);
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
    return write(`revoked by ${type}`, appUserId, eventMs, null);
  }

  if (LOOKUP_TYPES.has(type)) {
    // Never granted from its own payload. For a CANCELLATION that reads as the
    // end of access (a refund, no expiry, or an expiry already past), a lookup
    // that fails writes free before RevenueCat is asked to retry.
    const refundLike =
      type === 'CANCELLATION' &&
      ((typeof event.cancel_reason === 'string' &&
        event.cancel_reason.toUpperCase() === 'CUSTOMER_SUPPORT') ||
        expiresAtMs === null ||
        expiresAtMs <= now);
    return lookup(`${type}: look up in RevenueCat`, [appUserId], eventMs, refundLike);
  }

  // GRANTING_TYPES from here.
  if (!grantsPlus(event)) {
    return ignore('event does not concern the plus entitlement', eventMs);
  }

  // No expiry is believed only from a non-renewing (lifetime) purchase. On a
  // subscription event it can't be told from a malformed one, and believing
  // it would write Plus for ever, so RevenueCat is asked instead.
  if (expiresAtMs === null && !NON_EXPIRING_GRANT_TYPES.has(type)) {
    return lookup(`${type} with no expiry: look up in RevenueCat`, [appUserId], eventMs);
  }

  // A grant whose expiry has already passed is not a grant. This is what makes
  // a late-delivered RENEWAL for a period that has since ended harmless.
  const active = expiresAtMs === null || expiresAtMs > now;
  if (!active) {
    return write(`${type} with an expiry in the past`, appUserId, eventMs, null);
  }

  return write(`granted by ${type}`, appUserId, eventMs, {
    isPlus: true,
    source: sourceFor(event, expiresAtMs),
    expiresAt,
  });
}

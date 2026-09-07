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

/** Mirrors EntitlementSource in src/types/index.ts. */
export type EntitlementSource = 'none' | 'trial' | 'monthly' | 'annual' | 'lifetime';

/** Mirrors PRODUCT_IDS in src/billing/revenuecat.ts. Keep in lockstep. */
export const PRODUCT_IDS = {
  monthly: 'calibrate_plus_monthly',
  annual: 'calibrate_plus_annual',
  lifetime: 'calibrate_plus_lifetime',
} as const;

/** Mirrors PLUS_ENTITLEMENT_ID in src/billing/revenuecat.ts. */
export const PLUS_ENTITLEMENT_ID = 'plus';

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
}

export interface EntitlementDecision {
  /** `write` upserts the row; `ignore` acknowledges the event and does nothing. */
  action: 'write' | 'ignore';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ignore = (reason: string, eventMs = 0): EntitlementDecision => ({
  action: 'ignore',
  reason,
  userId: null,
  isPlus: false,
  source: 'none',
  expiresAt: null,
  eventMs,
});

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  switch (productId) {
    case PRODUCT_IDS.monthly:
      return 'monthly';
    case PRODUCT_IDS.annual:
      return 'annual';
    case PRODUCT_IDS.lifetime:
      return 'lifetime';
    default:
      return null;
  }
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
export function decideFromEvent(body: unknown, now: number): EntitlementDecision {
  const event = (body as { event?: RevenueCatEvent } | null)?.event;
  if (!event || typeof event !== 'object') return ignore('no event object');

  const type = typeof event.type === 'string' ? event.type.toUpperCase() : '';
  if (!type) return ignore('event has no type');

  const eventMs = num(event.event_timestamp_ms) ?? now;

  if (IGNORED_TYPES.has(type)) return ignore(`ignored event type ${type}`, eventMs);

  // The app configures RevenueCat with the Supabase user id, so a well-formed
  // event carries one. Anything else — an anonymous id from a purchase made
  // before sign-in, most often — has no row to write. RevenueCat sends a
  // TRANSFER once that purchase is attached to a real user, and that event is
  // the one that lands the row.
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
  };
}

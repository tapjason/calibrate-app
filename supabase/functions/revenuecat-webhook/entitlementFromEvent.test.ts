// Jest tests for the webhook's decision logic. The function around it runs on
// Deno and can't be tested here, which is exactly why the part that decides
// who is Plus was pulled into a plain-TypeScript module.

import { PRODUCT_ALIASES, PRODUCT_IDS, decideFromEvent } from './entitlementFromEvent';

const USER = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const FUTURE = Date.parse('2027-01-01T00:00:00.000Z');
const PAST = Date.parse('2026-01-01T00:00:00.000Z');

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      type: 'INITIAL_PURCHASE',
      id: 'evt_1',
      app_user_id: USER,
      product_id: PRODUCT_IDS.annual,
      period_type: 'NORMAL',
      expiration_at_ms: FUTURE,
      event_timestamp_ms: NOW,
      entitlement_ids: ['plus'],
      ...overrides,
    },
  };
}

describe('granting', () => {
  it('grants Plus on an initial purchase', () => {
    expect(decideFromEvent(event(), NOW)).toMatchObject({
      action: 'write',
      userId: USER,
      isPlus: true,
      source: 'annual',
      expiresAt: new Date(FUTURE).toISOString(),
    });
  });

  it.each([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'NON_RENEWING_PURCHASE',
    'SUBSCRIPTION_EXTENDED',
  ])('grants on %s', (type) => {
    expect(decideFromEvent(event({ type }), NOW)).toMatchObject({
      action: 'write',
      isPlus: true,
    });
  });

  it('maps each product to its source', () => {
    for (const [source, product_id] of Object.entries(PRODUCT_IDS)) {
      expect(decideFromEvent(event({ product_id }), NOW)).toMatchObject({ source });
    }
  });

  it('maps a product alias to its plan (the Test Store products, 2026-11-03)', () => {
    for (const [source, ids] of Object.entries(PRODUCT_ALIASES)) {
      for (const product_id of ids) {
        expect(decideFromEvent(event({ product_id }), NOW)).toMatchObject({ source });
      }
    }
    expect(PRODUCT_ALIASES.annual).toContain('calibrate_plus_annual_2999');
    expect(PRODUCT_ALIASES.monthly).toContain('calibrate_plus_monthly_notrial');
    expect(PRODUCT_ALIASES.lifetime).toContain('calibrate_plus_lifetime');
  });

  it('records a trial as source=trial', () => {
    expect(decideFromEvent(event({ period_type: 'TRIAL' }), NOW)).toMatchObject({
      isPlus: true,
      source: 'trial',
    });
  });

  it('treats a null expiry on a non-renewing purchase as a lifetime grant', () => {
    expect(
      decideFromEvent(
        event({
          type: 'NON_RENEWING_PURCHASE',
          product_id: PRODUCT_IDS.lifetime,
          expiration_at_ms: null,
        }),
        NOW,
      ),
    ).toMatchObject({ action: 'write', isPlus: true, source: 'lifetime', expiresAt: null });
  });

  // The lifetime product's id changed (2026-11-26): `calibrate_plus_lifetime`
  // was created as a non-renewing subscription by mistake, and the
  // non-consumable that replaced it is `calibrate_plus_lifetime_once`. A
  // non-consumable arrives as NON_RENEWING_PURCHASE with no expiry. The ids are
  // written out, so a wrong one in PRODUCT_IDS fails here.
  it('grants the non-consumable lifetime for ever', () => {
    expect(
      decideFromEvent(
        event({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'calibrate_plus_lifetime_once',
          expiration_at_ms: null,
        }),
        NOW,
      ),
    ).toMatchObject({
      action: 'write',
      userId: USER,
      isPlus: true,
      source: 'lifetime',
      expiresAt: null,
    });
  });

  it('grants the non-consumable lifetime from its product when the event names no entitlement', () => {
    expect(
      decideFromEvent(
        event({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'calibrate_plus_lifetime_once',
          expiration_at_ms: null,
          entitlement_ids: undefined,
        }),
        NOW,
      ),
    ).toMatchObject({ action: 'write', isPlus: true, source: 'lifetime', expiresAt: null });
  });

  it('still reads the first lifetime id (sandbox purchases only) as lifetime', () => {
    expect(
      decideFromEvent(
        event({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'calibrate_plus_lifetime',
          expiration_at_ms: null,
        }),
        NOW,
      ),
    ).toMatchObject({ action: 'write', isPlus: true, source: 'lifetime', expiresAt: null });
  });

  // Security review, 2026-11-18: a subscription event with no expiry can't be
  // told from a malformed one, and believing it would write Plus for ever.
  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'BILLING_ISSUE', 'SUBSCRIPTION_EXTENDED'])(
    'looks up a %s with no expiry instead of granting for ever',
    (type) => {
      const d = decideFromEvent(
        event({ type, product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
        NOW,
      );
      expect(d).toMatchObject({ action: 'lookup', isPlus: false, lookupUserIds: [USER] });
    },
  );

  it('falls back to the product when the event carries no entitlement ids', () => {
    const e = event({ entitlement_ids: undefined });
    expect(decideFromEvent(e, NOW)).toMatchObject({ isPlus: true });
  });

  it('accepts the deprecated singular entitlement_id', () => {
    const e = event({ entitlement_ids: undefined, entitlement_id: 'plus' });
    expect(decideFromEvent(e, NOW)).toMatchObject({ isPlus: true });
  });
});

describe('revoking', () => {
  it('revokes on EXPIRATION', () => {
    expect(decideFromEvent(event({ type: 'EXPIRATION' }), NOW)).toMatchObject({
      action: 'write',
      userId: USER,
      isPlus: false,
      source: 'none',
      expiresAt: null,
    });
  });

  // RevenueCat never sends REFUND (a refund is a CANCELLATION), and says of
  // SUBSCRIPTION_PAUSED: "Don't revoke access on this event. Revoke access
  // only on EXPIRATION".
  it.each(['REFUND', 'SUBSCRIPTION_PAUSED'])('neither revokes nor grants on %s', (type) => {
    expect(decideFromEvent(event({ type }), NOW)).toMatchObject({
      action: 'ignore',
      userId: null,
      isPlus: false,
    });
  });

  // Turning off auto-renew is not the end of access. Revoking here would take
  // away weeks the user already paid for; granting from it is how a refund
  // stayed Plus. So RevenueCat is asked.
  it('neither revokes nor grants on CANCELLATION: it is looked up', () => {
    expect(decideFromEvent(event({ type: 'CANCELLATION' }), NOW)).toMatchObject({
      action: 'lookup',
      isPlus: false,
      lookupUserIds: [USER],
    });
  });

  // A billing retry has a grace period; access continues while RevenueCat
  // works it out.
  it('does NOT revoke on BILLING_ISSUE with a future expiry', () => {
    expect(decideFromEvent(event({ type: 'BILLING_ISSUE' }), NOW)).toMatchObject({
      isPlus: true,
    });
  });

  it('writes free when a grant arrives with an expiry already in the past', () => {
    expect(
      decideFromEvent(event({ type: 'RENEWAL', expiration_at_ms: PAST }), NOW),
    ).toMatchObject({ isPlus: false, source: 'none' });
  });
});

// Security review, 2026-11-18. RevenueCat has no REFUND event: a refund
// arrives as CANCELLATION with cancel_reason CUSTOMER_SUPPORT, for a
// subscription or a lifetime purchase, and a lifetime's expiration_at_ms is
// null. Until then a CANCELLATION went down the grant path, where a null
// expiry read as non-expiring, so a refunded Lifetime was written as Plus for
// ever.
describe('CANCELLATION and the other looked-up events', () => {
  const refund = (expiration_at_ms: number | null) =>
    event({
      type: 'CANCELLATION',
      cancel_reason: 'CUSTOMER_SUPPORT',
      product_id: expiration_at_ms === null ? PRODUCT_IDS.lifetime : PRODUCT_IDS.annual,
      expiration_at_ms,
    });

  it.each([
    ['a null expiry (a refunded Lifetime)', null],
    ['a past expiry', PAST],
    ['a future expiry', FUTURE],
  ])('looks up a refund with %s, and writes free if the lookup fails', (_label, expiry) => {
    expect(decideFromEvent(refund(expiry), NOW)).toMatchObject({
      action: 'lookup',
      isPlus: false,
      userId: null,
      lookupUserIds: [USER],
      failClosed: true,
      eventMs: NOW,
    });
  });

  it('reads cancel_reason in any case', () => {
    const d = decideFromEvent(
      event({ type: 'CANCELLATION', cancel_reason: 'customer_support' }),
      NOW,
    );
    expect(d.failClosed).toBe(true);
  });

  // Auto-renew off: access runs to the expiry, which the lookup says. A
  // failed lookup must not take that away, so nothing is written then.
  it('looks up an ordinary cancellation of a running subscription without failing closed', () => {
    expect(
      decideFromEvent(
        event({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: FUTURE }),
        NOW,
      ),
    ).toMatchObject({ action: 'lookup', lookupUserIds: [USER], failClosed: false });
  });

  it.each([
    ['no expiry', null],
    ['an expiry already past', PAST],
  ])('fails closed on any cancellation with %s', (_label, expiration_at_ms) => {
    const d = decideFromEvent(
      event({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms }),
      NOW,
    );
    expect(d).toMatchObject({ action: 'lookup', failClosed: true });
  });

  it.each(['REFUND_REVERSED', 'TEMPORARY_ENTITLEMENT_GRANT', 'PURCHASE_REDEEMED'])(
    'looks up %s and never grants from its payload',
    (type) => {
      expect(decideFromEvent(event({ type, expiration_at_ms: null }), NOW)).toMatchObject({
        action: 'lookup',
        isPlus: false,
        lookupUserIds: [USER],
        failClosed: false,
      });
    },
  );

  it('ignores a looked-up event whose app_user_id is not a Supabase user id', () => {
    expect(
      decideFromEvent(event({ type: 'CANCELLATION', app_user_id: '$RCAnonymousID:x' }), NOW),
    ).toMatchObject({ action: 'ignore', lookupUserIds: [] });
  });

  it('is ignored with the other sandbox events when configured to', () => {
    expect(
      decideFromEvent(event({ type: 'CANCELLATION', environment: 'SANDBOX' }), NOW, {
        ignoreSandbox: true,
      }),
    ).toMatchObject({ action: 'ignore' });
  });
});

describe('ignoring', () => {
  it.each([
    ['a test event', event({ type: 'TEST' })],
    ['an alias event', event({ type: 'SUBSCRIBER_ALIAS' })],
    ['an invoice event', event({ type: 'INVOICE_ISSUANCE' })],
    ['a virtual currency event', event({ type: 'VIRTUAL_CURRENCY_TRANSACTION' })],
    ['an experiment event', event({ type: 'EXPERIMENT_ENROLLMENT' })],
    ['a price increase event', event({ type: 'PRICE_INCREASE_CONSENT_REQUIRED' })],
    ['an approved price increase', event({ type: 'PRICE_INCREASE_CONSENT_APPROVED' })],
  ])('ignores %s', (_label, payload) => {
    expect(decideFromEvent(payload, NOW).action).toBe('ignore');
  });

  // A closed list: an event type RevenueCat adds later can't grant Plus by
  // carrying a product id and no expiry.
  it('ignores an event type it does not know, whatever it carries', () => {
    const d = decideFromEvent(
      event({ type: 'SOMETHING_NEW', product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
      NOW,
    );
    expect(d).toMatchObject({ action: 'ignore', userId: null, isPlus: false, lookupUserIds: [] });
    expect(d.reason).toBe('unknown event type SOMETHING_NEW');
  });

  // RevenueCat ids are case-sensitive, Postgres uuids aren't, and Supabase
  // writes lowercase (security review, 2026-11-18).
  it('ignores an app_user_id in uppercase, and takes the same id in lowercase', () => {
    const lower = 'abcdef01-2345-4789-abcd-ef0123456789';
    expect(decideFromEvent(event({ app_user_id: lower.toUpperCase() }), NOW)).toMatchObject({
      action: 'ignore',
      userId: null,
    });
    expect(decideFromEvent(event({ app_user_id: lower }), NOW)).toMatchObject({
      action: 'write',
      userId: lower,
    });
  });

  // A purchase made before sign-in is on an anonymous RevenueCat id. There is
  // no row to write for it; a TRANSFER (looked up) or the Coach's own
  // RevenueCat lookup lands it once it sits under a Supabase user.
  it('ignores an anonymous app_user_id', () => {
    const e = event({ app_user_id: '$RCAnonymousID:abc123' });
    expect(decideFromEvent(e, NOW)).toMatchObject({ action: 'ignore', userId: null });
  });

  it('ignores an event for a different entitlement', () => {
    const e = event({ entitlement_ids: ['some_other_tier'], product_id: 'other_sku' });
    expect(decideFromEvent(e, NOW).action).toBe('ignore');
  });

  it.each([
    ['null', null],
    ['no event key', {}],
    ['a string', 'nonsense'],
    ['an event with no type', { event: { app_user_id: USER } }],
  ])('ignores %s rather than throwing', (_label, payload) => {
    expect(decideFromEvent(payload, NOW).action).toBe('ignore');
  });
});

// A TRANSFER names users, never an entitlement or an expiry (RevenueCat's
// docs: only transferred_from / transferred_to). Until step 189 it was always
// ignored, so a purchase that reached a Supabase user this way never wrote a
// row and the Coach answered a paying subscriber 403.
describe('TRANSFER', () => {
  const OTHER = '66666666-7777-8888-9999-000000000000';

  function transfer(overrides: Record<string, unknown> = {}) {
    return {
      event: {
        type: 'TRANSFER',
        id: 'evt_t',
        event_timestamp_ms: NOW,
        environment: 'SANDBOX',
        transferred_from: [OTHER],
        transferred_to: [USER],
        ...overrides,
      },
    };
  }

  it('asks for a lookup of every Supabase user named, destination first', () => {
    expect(decideFromEvent(transfer(), NOW)).toMatchObject({
      action: 'lookup',
      userId: null,
      lookupUserIds: [USER, OTHER],
      eventMs: NOW,
    });
  });

  it('drops anonymous ids and anything that is not a uuid', () => {
    const d = decideFromEvent(
      transfer({
        transferred_from: ['$RCAnonymousID:abc123', 42, null, 'not-a-uuid'],
        transferred_to: [USER, '$RCAnonymousID:def456'],
      }),
      NOW,
    );
    expect(d).toMatchObject({ action: 'lookup', lookupUserIds: [USER] });
  });

  it('looks a user up once when named on both sides', () => {
    const d = decideFromEvent(transfer({ transferred_from: [USER], transferred_to: [USER] }), NOW);
    expect(d.lookupUserIds).toEqual([USER]);
  });

  it('ignores a transfer between anonymous ids only', () => {
    const d = decideFromEvent(
      transfer({ transferred_from: ['$RCAnonymousID:a'], transferred_to: ['$RCAnonymousID:b'] }),
      NOW,
    );
    expect(d).toMatchObject({ action: 'ignore', lookupUserIds: [] });
  });

  it.each([
    ['missing lists', { transferred_from: undefined, transferred_to: undefined }],
    ['lists that are not arrays', { transferred_from: USER, transferred_to: { id: USER } }],
  ])('ignores %s rather than throwing', (_label, overrides) => {
    expect(decideFromEvent(transfer(overrides), NOW).action).toBe('ignore');
  });

  // Even shaped like a purchase, a TRANSFER is decided by the lookup: its own
  // fields are not the truth about what either side owns.
  it('never writes straight from the event', () => {
    const d = decideFromEvent(
      transfer({
        app_user_id: USER,
        product_id: PRODUCT_IDS.annual,
        expiration_at_ms: FUTURE,
        entitlement_ids: ['plus'],
      }),
      NOW,
    );
    expect(d).toMatchObject({ action: 'lookup', isPlus: false, userId: null });
  });

  it('carries the event timestamp as the cursor', () => {
    expect(decideFromEvent(transfer({ event_timestamp_ms: 1234 }), NOW).eventMs).toBe(1234);
  });

  it('is ignored with the other sandbox events when configured to', () => {
    expect(decideFromEvent(transfer(), NOW, { ignoreSandbox: true })).toMatchObject({
      action: 'ignore',
      lookupUserIds: [],
    });
  });

  it('leaves the lookup list empty on every other decision', () => {
    expect(decideFromEvent(event(), NOW).lookupUserIds).toEqual([]);
    expect(decideFromEvent(event({ type: 'EXPIRATION' }), NOW).lookupUserIds).toEqual([]);
  });
});

describe('event cursor', () => {
  it('carries the event timestamp through for the out-of-order guard', () => {
    expect(decideFromEvent(event({ event_timestamp_ms: 1234 }), NOW).eventMs).toBe(1234);
  });

  it('falls back to now when the event has no timestamp', () => {
    expect(
      decideFromEvent(event({ event_timestamp_ms: undefined }), NOW).eventMs,
    ).toBe(NOW);
  });
});

describe('sandbox events', () => {
  // The default. App Review buys with a sandbox account, and a reviewer who
  // subscribes and then gets a Coach answering 403 rejects the app.
  it('grants from a sandbox purchase unless told otherwise', () => {
    expect(decideFromEvent(event({ environment: 'SANDBOX' }), NOW)).toMatchObject({
      action: 'write',
      isPlus: true,
    });
  });

  it('ignores a sandbox purchase when configured to', () => {
    expect(
      decideFromEvent(event({ environment: 'SANDBOX' }), NOW, { ignoreSandbox: true }),
    ).toMatchObject({ action: 'ignore', reason: 'sandbox event ignored in this deployment' });
  });

  it('ignores sandbox revocations too, since no sandbox grant was written', () => {
    expect(
      decideFromEvent(event({ environment: 'SANDBOX', type: 'EXPIRATION' }), NOW, {
        ignoreSandbox: true,
      }),
    ).toMatchObject({ action: 'ignore' });
  });

  it('still grants production purchases when ignoring sandbox', () => {
    expect(
      decideFromEvent(event({ environment: 'PRODUCTION' }), NOW, { ignoreSandbox: true }),
    ).toMatchObject({ action: 'write', isPlus: true });
  });
});


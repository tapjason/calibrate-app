// Jest tests for the webhook's decision logic. The function around it runs on
// Deno and can't be tested here, which is exactly why the part that decides
// who is Plus was pulled into a plain-TypeScript module.

import { PRODUCT_IDS, decideFromEvent } from './entitlementFromEvent';

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

  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'TRANSFER'])(
    'grants on %s',
    (type) => {
      expect(decideFromEvent(event({ type }), NOW)).toMatchObject({ isPlus: true });
    },
  );

  it('maps each product to its source', () => {
    for (const [source, product_id] of Object.entries(PRODUCT_IDS)) {
      expect(decideFromEvent(event({ product_id }), NOW)).toMatchObject({ source });
    }
  });

  it('records a trial as source=trial', () => {
    expect(decideFromEvent(event({ period_type: 'TRIAL' }), NOW)).toMatchObject({
      isPlus: true,
      source: 'trial',
    });
  });

  it('treats a null expiry as a non-expiring grant', () => {
    expect(
      decideFromEvent(
        event({ product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
        NOW,
      ),
    ).toMatchObject({ isPlus: true, source: 'lifetime', expiresAt: null });
  });

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
  it.each(['EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED'])('revokes on %s', (type) => {
    expect(decideFromEvent(event({ type }), NOW)).toMatchObject({
      action: 'write',
      userId: USER,
      isPlus: false,
      source: 'none',
      expiresAt: null,
    });
  });

  // Turning off auto-renew is not the end of access. Revoking here would take
  // away weeks the user already paid for — and it is the single most likely
  // way to get this wrong.
  it('does NOT revoke on CANCELLATION while the term is still running', () => {
    expect(decideFromEvent(event({ type: 'CANCELLATION' }), NOW)).toMatchObject({
      isPlus: true,
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

describe('ignoring', () => {
  it.each([
    ['a test event', event({ type: 'TEST' })],
    ['an alias event', event({ type: 'SUBSCRIBER_ALIAS' })],
    ['an invoice event', event({ type: 'INVOICE_ISSUANCE' })],
  ])('ignores %s', (_label, payload) => {
    expect(decideFromEvent(payload, NOW).action).toBe('ignore');
  });

  // A purchase made before sign-in is on an anonymous RevenueCat id. There is
  // no row to write; the TRANSFER that follows sign-in is what lands it.
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


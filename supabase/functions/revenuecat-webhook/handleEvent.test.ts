// Jest tests for the webhook's whole flow: decide, look up, write, answer
// (security review, 2026-11-18). The RevenueCat lookup and the RPC are
// injected; the store below applies the same guard as
// `apply_entitlement_event` (migration 004), so replays and out-of-order
// deliveries are exercised end to end.

import type { EntitlementWrite, PlusLookup } from '../_shared/revenuecatLookup';
import { PRODUCT_IDS } from './entitlementFromEvent';
import { handleWebhookEvent, type WebhookDeps, type WriteOutcome } from './handleEvent';

const USER = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const FUTURE = Date.parse('2027-11-18T12:00:00.000Z');
const PAST = Date.parse('2026-11-01T00:00:00.000Z');
const T1 = NOW - 60_000;
const T2 = NOW - 30_000;

interface Row {
  isPlus: boolean;
  source: string;
  expiresAt: string | null;
  lastEventMs: number | null;
}

/**
 * `public.entitlements` with migration 004's guard: a row is replaced only
 * when it has no cursor or its cursor is <= the incoming event's (`<=`, so a
 * retried delivery of the same event is idempotent).
 */
function entitlementsTable() {
  const rows = new Map<string, Row>();
  const calls: EntitlementWrite[] = [];
  const write = async (w: EntitlementWrite): Promise<WriteOutcome> => {
    calls.push(w);
    const row = rows.get(w.userId);
    if (!row || row.lastEventMs === null || row.lastEventMs <= w.eventMs) {
      rows.set(w.userId, {
        isPlus: w.isPlus,
        source: w.source,
        expiresAt: w.expiresAt,
        lastEventMs: w.eventMs,
      });
    }
    return 'written';
  };
  return { rows, calls, write };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      type: 'INITIAL_PURCHASE',
      id: 'evt_1',
      app_user_id: USER,
      product_id: PRODUCT_IDS.annual,
      period_type: 'NORMAL',
      expiration_at_ms: FUTURE,
      event_timestamp_ms: T1,
      entitlement_ids: ['plus'],
      environment: 'PRODUCTION',
      ...overrides,
    },
  };
}

/** A refund: RevenueCat's CANCELLATION with cancel_reason CUSTOMER_SUPPORT. */
function refund(expiration_at_ms: number | null, overrides: Record<string, unknown> = {}) {
  return event({
    type: 'CANCELLATION',
    id: 'evt_refund',
    cancel_reason: 'CUSTOMER_SUPPORT',
    product_id: expiration_at_ms === null ? PRODUCT_IDS.lifetime : PRODUCT_IDS.annual,
    expiration_at_ms,
    event_timestamp_ms: T2,
    ...overrides,
  });
}

const NONE: PlusLookup = { status: 'none' };
const PLUS_UNTIL_FUTURE: PlusLookup = {
  status: 'plus',
  expiresAt: new Date(FUTURE).toISOString(),
  source: 'annual',
};
const LIFETIME: PlusLookup = { status: 'plus', expiresAt: null, source: 'lifetime' };

function setup(lookupResult: PlusLookup | (() => PlusLookup) = NONE) {
  const table = entitlementsTable();
  const lookup = jest.fn(async (_userId: string) =>
    typeof lookupResult === 'function' ? lookupResult() : lookupResult,
  );
  const deps: WebhookDeps = { now: () => NOW, lookup, write: table.write };
  return { table, lookup, deps };
}

describe('a refund (CANCELLATION, cancel_reason CUSTOMER_SUPPORT)', () => {
  it.each([
    ['a null expiry (a refunded Lifetime)', null],
    ['a past expiry', PAST],
    ['a future expiry', FUTURE],
  ])('with %s writes what RevenueCat says now: free', async (_label, expiry) => {
    const { table, lookup, deps } = setup(NONE);
    // Plus before the refund: a lifetime row for a null expiry, else dated.
    await table.write({
      userId: USER,
      isPlus: true,
      source: expiry === null ? 'lifetime' : 'annual',
      expiresAt: expiry === null ? null : new Date(FUTURE).toISOString(),
      eventMs: T1,
    });

    const reply = await handleWebhookEvent(refund(expiry), deps);

    expect(reply).toEqual({
      status: 200,
      body: { ok: true, action: 'written', reason: 'CANCELLATION: look up in RevenueCat' },
    });
    expect(lookup).toHaveBeenCalledWith(USER);
    expect(table.rows.get(USER)).toEqual({
      isPlus: false,
      source: 'none',
      expiresAt: null,
      lastEventMs: T2,
    });
  });

  it('never grants from the payload, even when the lookup says Plus for another reason', async () => {
    // A refund of one period while RevenueCat still reports an active plus
    // (a refund that didn't cancel): written exactly as RevenueCat says.
    const { table, deps } = setup(PLUS_UNTIL_FUTURE);
    await handleWebhookEvent(refund(null), deps);
    expect(table.rows.get(USER)).toMatchObject({
      isPlus: true,
      expiresAt: new Date(FUTURE).toISOString(),
      source: 'annual',
    });
  });

  it('writes free and answers 500 when the lookup fails, so a refund cannot stay Plus', async () => {
    const { table, deps } = setup({ status: 'error', reason: 'http_503' });
    await table.write({ userId: USER, isPlus: true, source: 'lifetime', expiresAt: null, eventMs: T1 });

    const reply = await handleWebhookEvent(refund(null), deps);

    expect(reply).toEqual({ status: 500, body: { error: 'lookup_failed' } });
    expect(table.rows.get(USER)).toMatchObject({ isPlus: false, lastEventMs: T2 });
  });

  it('lets the retry write the truth over the fail-closed row', async () => {
    let answer: PlusLookup = { status: 'error', reason: 'timeout' };
    const { table, deps } = setup(() => answer);

    expect((await handleWebhookEvent(refund(FUTURE), deps)).status).toBe(500);
    expect(table.rows.get(USER)?.isPlus).toBe(false);

    // RevenueCat retries with the same id and event_timestamp_ms; this time
    // the lookup answers, and says the subscription is still running.
    answer = PLUS_UNTIL_FUTURE;
    expect((await handleWebhookEvent(refund(FUTURE), deps)).status).toBe(200);
    expect(table.rows.get(USER)).toMatchObject({ isPlus: true, lastEventMs: T2 });
  });

  it('answers 500 when the fail-closed write itself fails', async () => {
    const write = jest.fn(async (): Promise<WriteOutcome> => 'failed');
    const deps: WebhookDeps = {
      now: () => NOW,
      lookup: async () => ({ status: 'error', reason: 'network' }),
      write,
    };
    expect(await handleWebhookEvent(refund(null), deps)).toEqual({
      status: 500,
      body: { error: 'lookup_failed' },
    });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, isPlus: false, eventMs: T2 }),
    );
  });
});

describe('an ordinary cancellation (auto-renew off)', () => {
  const unsubscribe = () =>
    event({
      type: 'CANCELLATION',
      id: 'evt_cancel',
      cancel_reason: 'UNSUBSCRIBE',
      expiration_at_ms: FUTURE,
      event_timestamp_ms: T2,
    });

  it('keeps Plus until the expiry, because the lookup says so', async () => {
    const { table, lookup, deps } = setup(PLUS_UNTIL_FUTURE);
    await table.write({
      userId: USER,
      isPlus: true,
      source: 'annual',
      expiresAt: new Date(FUTURE).toISOString(),
      eventMs: T1,
    });

    const reply = await handleWebhookEvent(unsubscribe(), deps);

    expect(reply.status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(table.rows.get(USER)).toEqual({
      isPlus: true,
      source: 'annual',
      expiresAt: new Date(FUTURE).toISOString(),
      lastEventMs: T2,
    });
  });

  it('writes nothing and answers 500 when the lookup fails: time already paid for is kept', async () => {
    const { table, deps } = setup({ status: 'error', reason: 'http_500' });
    await table.write({
      userId: USER,
      isPlus: true,
      source: 'annual',
      expiresAt: new Date(FUTURE).toISOString(),
      eventMs: T1,
    });
    const before = [...table.calls];

    const reply = await handleWebhookEvent(unsubscribe(), deps);

    expect(reply).toEqual({ status: 500, body: { error: 'lookup_failed' } });
    expect(table.calls).toEqual(before);
    expect(table.rows.get(USER)?.isPlus).toBe(true);
  });
});

describe('REFUND_REVERSED', () => {
  const reversed = () =>
    event({ type: 'REFUND_REVERSED', id: 'evt_rev', expiration_at_ms: null, event_timestamp_ms: NOW });

  it('writes what RevenueCat says now, after a refund made it free', async () => {
    const { table, deps } = setup(LIFETIME);
    await table.write({ userId: USER, isPlus: false, source: 'none', expiresAt: null, eventMs: T2 });

    const reply = await handleWebhookEvent(reversed(), deps);

    expect(reply.status).toBe(200);
    expect(table.rows.get(USER)).toEqual({
      isPlus: true,
      source: 'lifetime',
      expiresAt: null,
      lastEventMs: NOW,
    });
  });

  it('does not grant when RevenueCat says none', async () => {
    const { table, deps } = setup(NONE);
    await handleWebhookEvent(reversed(), deps);
    expect(table.rows.get(USER)?.isPlus).toBe(false);
  });

  it('writes nothing when the lookup fails (no fail-closed write needed: it can only grant)', async () => {
    const { table, deps } = setup({ status: 'error', reason: 'timeout' });
    const reply = await handleWebhookEvent(reversed(), deps);
    expect(reply.status).toBe(500);
    expect(table.calls).toHaveLength(0);
  });
});

describe('replays and out-of-order delivery', () => {
  it('a replayed refund is idempotent', async () => {
    const { table, deps } = setup(NONE);
    const first = await handleWebhookEvent(refund(null), deps);
    const second = await handleWebhookEvent(refund(null), deps);

    expect(first).toEqual(second);
    expect(first.status).toBe(200);
    expect(table.rows.get(USER)).toEqual({
      isPlus: false,
      source: 'none',
      expiresAt: null,
      lastEventMs: T2,
    });
  });

  it('a replayed purchase is idempotent', async () => {
    const { table, deps } = setup();
    await handleWebhookEvent(event(), deps);
    await handleWebhookEvent(event(), deps);
    expect(table.rows.get(USER)).toMatchObject({ isPlus: true, lastEventMs: T1 });
  });

  it('a purchase delivered after the newer refund does not bring Plus back', async () => {
    const { table, deps } = setup(NONE);
    // The refund (T2) arrives first, the purchase (T1) late, after retries.
    await handleWebhookEvent(refund(null), deps);
    await handleWebhookEvent(
      event({ type: 'NON_RENEWING_PURCHASE', product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
      deps,
    );
    expect(table.rows.get(USER)).toMatchObject({ isPlus: false, lastEventMs: T2 });
  });

  it('a purchase then its refund, in order, ends free', async () => {
    const { table, deps } = setup(NONE);
    await handleWebhookEvent(
      event({ type: 'NON_RENEWING_PURCHASE', product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
      deps,
    );
    expect(table.rows.get(USER)).toMatchObject({ isPlus: true, expiresAt: null });
    await handleWebhookEvent(refund(null), deps);
    expect(table.rows.get(USER)).toMatchObject({ isPlus: false, lastEventMs: T2 });
  });

  it('a renewal delivered after a newer expiration does not resurrect Plus', async () => {
    const { table, deps } = setup();
    await handleWebhookEvent(event({ type: 'EXPIRATION', event_timestamp_ms: T2 }), deps);
    await handleWebhookEvent(event({ type: 'RENEWAL', event_timestamp_ms: T1 }), deps);
    expect(table.rows.get(USER)).toMatchObject({ isPlus: false, lastEventMs: T2 });
  });
});

describe('what RevenueCat is answered', () => {
  it('acknowledges an unknown event type with exactly 200 and writes nothing', async () => {
    const { table, lookup, deps } = setup(LIFETIME);
    const reply = await handleWebhookEvent(
      event({ type: 'SOMETHING_NEW', product_id: PRODUCT_IDS.lifetime, expiration_at_ms: null }),
      deps,
    );
    expect(reply).toEqual({
      status: 200,
      body: { ok: true, action: 'ignored', reason: 'unknown event type SOMETHING_NEW' },
    });
    expect(table.calls).toHaveLength(0);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('acknowledges a TEST event with exactly 200', async () => {
    const { table, deps } = setup();
    const reply = await handleWebhookEvent(event({ type: 'TEST' }), deps);
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ ok: true, action: 'ignored' });
    expect(table.calls).toHaveLength(0);
  });

  it('answers exactly 200 with action written on a grant', async () => {
    const { deps } = setup();
    expect(await handleWebhookEvent(event(), deps)).toEqual({
      status: 200,
      body: { ok: true, action: 'written', reason: 'granted by INITIAL_PURCHASE' },
    });
  });

  it('acknowledges an event for a deleted account', async () => {
    const deps: WebhookDeps = {
      now: () => NOW,
      lookup: async () => NONE,
      write: async () => 'no_user',
    };
    expect(await handleWebhookEvent(event(), deps)).toEqual({
      status: 200,
      body: { ok: true, action: 'ignored', reason: 'no such user' },
    });
  });

  it('answers 500 so RevenueCat retries when a write fails, or throws', async () => {
    for (const write of [async () => 'failed' as const, async () => Promise.reject(new Error('down'))]) {
      const deps: WebhookDeps = { now: () => NOW, lookup: async () => NONE, write };
      expect(await handleWebhookEvent(event(), deps)).toEqual({
        status: 500,
        body: { error: 'write_failed' },
      });
    }
  });

  it('treats a lookup that throws as a failed lookup', async () => {
    const { table } = setup();
    const deps: WebhookDeps = {
      now: () => NOW,
      lookup: async () => Promise.reject(new Error('boom')),
      write: table.write,
    };
    expect(await handleWebhookEvent(refund(null), deps)).toEqual({
      status: 500,
      body: { error: 'lookup_failed' },
    });
    // A refund still fails closed.
    expect(table.rows.get(USER)?.isPlus).toBe(false);
  });

  it('on a TRANSFER, a failed lookup writes nothing for anyone', async () => {
    const OTHER = '66666666-7777-8888-9999-000000000000';
    const table = entitlementsTable();
    const deps: WebhookDeps = {
      now: () => NOW,
      lookup: async (id) => (id === USER ? LIFETIME : { status: 'error', reason: 'timeout' }),
      write: table.write,
    };
    const reply = await handleWebhookEvent(
      {
        event: {
          type: 'TRANSFER',
          event_timestamp_ms: NOW,
          transferred_from: [OTHER],
          transferred_to: [USER],
        },
      },
      deps,
    );
    expect(reply.status).toBe(500);
    expect(table.calls).toHaveLength(0);
  });
});

// Jest tests for the Coach's Plus gate (step 189). The function around it runs
// on Deno; the decision (row, then RevenueCat) is plain TypeScript. The bug it
// fixes: a subscriber with no entitlements row got a 403 even though
// RevenueCat, and the app, said Plus.

import type { PlusLookup } from '../_shared/revenuecatLookup';

import {
  createNoneMemory,
  decidePlusGate,
  LOOKUP_CURSOR_LAG_MS,
  NONE_MEMORY_TTL_MS,
  rowGrantsPlus,
} from './plusGate';

const USER = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const FUTURE_ISO = '2027-11-17T12:00:00.000Z';
const PAST_ISO = '2026-11-01T00:00:00.000Z';

function lookupReturning(result: PlusLookup) {
  return jest.fn(async () => result);
}

describe('rowGrantsPlus', () => {
  it.each([
    ['a Plus row with no expiry', { is_plus: true, expires_at: null }],
    ['a Plus row with a future expiry', { is_plus: true, expires_at: FUTURE_ISO }],
  ])('grants %s', (_label, row) => {
    expect(rowGrantsPlus(row, NOW)).toBe(true);
  });

  it.each([
    ['no row', null],
    ['a free row', { is_plus: false, expires_at: null }],
    ['a lapsed row', { is_plus: true, expires_at: PAST_ISO }],
    ['an expiry that does not parse', { is_plus: true, expires_at: 'soon' }],
    ['is_plus that is not a boolean', { is_plus: 'true', expires_at: null }],
  ])('does not grant %s', (_label, row) => {
    expect(rowGrantsPlus(row, NOW)).toBe(false);
  });
});

describe('decidePlusGate — the row says Plus', () => {
  it('opens without asking RevenueCat', async () => {
    const lookup = lookupReturning({ status: 'none' });
    await expect(
      decidePlusGate(USER, { is_plus: true, expires_at: FUTURE_ISO }, NOW, lookup),
    ).resolves.toEqual({ entitled: true, via: 'row' });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('decidePlusGate — the row does not say Plus', () => {
  it.each([
    ['no row', null],
    ['a free row', { is_plus: false, expires_at: null }],
    ['a lapsed row', { is_plus: true, expires_at: PAST_ISO }],
  // The cursor was `now` until 2026-11-18 (security review, finding 13): a
  // revocation RevenueCat sent a moment before the lookup, landing a moment
  // after, was then dropped by migration 004's guard. It now sits a minute
  // behind.
  ])('asks RevenueCat when there is %s, and opens on its yes', async (_label, row) => {
    const lookup = lookupReturning({ status: 'plus', expiresAt: FUTURE_ISO, source: 'annual' });

    await expect(decidePlusGate(USER, row, NOW, lookup)).resolves.toEqual({
      entitled: true,
      via: 'lookup',
      write: {
        userId: USER,
        isPlus: true,
        source: 'annual',
        expiresAt: FUTURE_ISO,
        eventMs: NOW - 60_000,
      },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('puts the cursor a minute behind now', () => {
    expect(LOOKUP_CURSOR_LAG_MS).toBe(60_000);
  });

  it('writes a non-expiring grant as such', async () => {
    const lookup = lookupReturning({ status: 'plus', expiresAt: null, source: 'lifetime' });
    const outcome = await decidePlusGate(USER, null, NOW, lookup);
    expect(outcome).toMatchObject({
      entitled: true,
      write: { expiresAt: null, source: 'lifetime' },
    });
  });

  it('stays closed when RevenueCat says none', async () => {
    await expect(
      decidePlusGate(USER, null, NOW, lookupReturning({ status: 'none' })),
    ).resolves.toMatchObject({ entitled: false });
  });

  // Fail closed: an unreadable answer is never Plus.
  it.each(['not_configured', 'timeout', 'http_429', 'http_503', 'bad_json'] as const)(
    'stays closed when the lookup fails (%s)',
    async (reason) => {
      const outcome = await decidePlusGate(
        USER,
        null,
        NOW,
        lookupReturning({ status: 'error', reason }),
      );
      expect(outcome).toEqual({
        entitled: false,
        reason: `revenuecat lookup failed (${reason})`,
      });
    },
  );

  it('stays closed if the lookup throws', async () => {
    const lookup = jest.fn(async (): Promise<PlusLookup> => {
      throw new Error('boom');
    });
    await expect(decidePlusGate(USER, null, NOW, lookup)).resolves.toMatchObject({
      entitled: false,
    });
  });

  it('stays closed on a yes whose expiry has already passed', async () => {
    const lookup = lookupReturning({ status: 'plus', expiresAt: PAST_ISO, source: 'annual' });
    await expect(decidePlusGate(USER, null, NOW, lookup)).resolves.toMatchObject({
      entitled: false,
    });
  });
});

// Security review 2026-11-18, finding 12: every call from a free user cost
// one or two RevenueCat requests against a budget shared with the webhook.
describe('decidePlusGate — remembering a "no"', () => {
  const OTHER = '99999999-2222-3333-4444-555555555555';

  it('asks once, then answers from memory for ten minutes', async () => {
    const memory = createNoneMemory();
    const lookup = lookupReturning({ status: 'none' });

    await expect(decidePlusGate(USER, null, NOW, lookup, memory)).resolves.toMatchObject({ entitled: false });
    await expect(decidePlusGate(USER, null, NOW + 60_000, lookup, memory)).resolves.toMatchObject({
      entitled: false,
      reason: expect.stringContaining('remembered'),
    });
    await expect(
      decidePlusGate(USER, null, NOW + NONE_MEMORY_TTL_MS - 1, lookup, memory),
    ).resolves.toMatchObject({ entitled: false });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(NONE_MEMORY_TTL_MS).toBe(10 * 60_000);
  });

  it('asks again once the ten minutes are up', async () => {
    const memory = createNoneMemory();
    const lookup = lookupReturning({ status: 'none' });
    await decidePlusGate(USER, null, NOW, lookup, memory);
    await decidePlusGate(USER, null, NOW + NONE_MEMORY_TTL_MS, lookup, memory);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('remembers per user', async () => {
    const memory = createNoneMemory();
    const lookup = lookupReturning({ status: 'none' });
    await decidePlusGate(USER, null, NOW, lookup, memory);
    await decidePlusGate(OTHER, null, NOW, lookup, memory);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  // An unreadable answer is not a "no", and must not keep a subscriber out.
  it.each(['timeout', 'http_429', 'http_503', 'not_configured'] as const)(
    'never remembers an error (%s)',
    async (reason) => {
      const memory = createNoneMemory();
      const lookup = lookupReturning({ status: 'error', reason });
      await decidePlusGate(USER, null, NOW, lookup, memory);
      await decidePlusGate(USER, null, NOW + 1_000, lookup, memory);
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(memory.has(USER, NOW + 1_000)).toBe(false);
    },
  );

  it('never remembers a lookup that throws', async () => {
    const memory = createNoneMemory();
    const lookup = jest.fn(async (): Promise<PlusLookup> => {
      throw new Error('boom');
    });
    await decidePlusGate(USER, null, NOW, lookup, memory);
    expect(memory.has(USER, NOW)).toBe(false);
  });

  it('lets the row open the gate at once, whatever is remembered', async () => {
    const memory = createNoneMemory();
    await decidePlusGate(USER, null, NOW, lookupReturning({ status: 'none' }), memory);
    // The webhook lands the purchase a minute later.
    await expect(
      decidePlusGate(USER, { is_plus: true, expires_at: FUTURE_ISO }, NOW + 60_000, lookupReturning({ status: 'none' }), memory),
    ).resolves.toEqual({ entitled: true, via: 'row' });
  });

  it('forgets a "no" once RevenueCat says Plus', async () => {
    const memory = createNoneMemory();
    memory.remember(USER, NOW - NONE_MEMORY_TTL_MS); // already lapsed
    const outcome = await decidePlusGate(
      USER,
      null,
      NOW,
      lookupReturning({ status: 'plus', expiresAt: FUTURE_ISO, source: 'annual' }),
      memory,
    );
    expect(outcome).toMatchObject({ entitled: true, via: 'lookup' });
    expect(memory.has(USER, NOW)).toBe(false);
  });

  it('works without a memory, as before', async () => {
    const lookup = lookupReturning({ status: 'none' });
    await decidePlusGate(USER, null, NOW, lookup);
    await decidePlusGate(USER, null, NOW, lookup);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});

describe('createNoneMemory', () => {
  it('holds no more than its limit, forgetting the oldest first', () => {
    const memory = createNoneMemory(60_000, 3);
    for (const id of ['a', 'b', 'c', 'd']) memory.remember(id, NOW);
    expect(memory.size).toBe(3);
    expect(memory.has('a', NOW)).toBe(false);
    expect(memory.has('d', NOW)).toBe(true);
  });

  it('sweeps lapsed entries as it goes', () => {
    const memory = createNoneMemory(60_000, 100);
    memory.remember('a', NOW);
    memory.remember('b', NOW);
    memory.remember('c', NOW + 120_000);
    expect(memory.size).toBe(1);
    expect(memory.has('c', NOW + 120_000)).toBe(true);
  });

  it('refreshes an entry remembered again', () => {
    const memory = createNoneMemory(60_000, 2);
    memory.remember('a', NOW);
    memory.remember('b', NOW);
    memory.remember('a', NOW + 1); // a is now the newest
    memory.remember('c', NOW + 2); // b, the oldest, goes
    expect(memory.has('a', NOW + 2)).toBe(true);
    expect(memory.has('b', NOW + 2)).toBe(false);
  });

  it('forgets on request', () => {
    const memory = createNoneMemory();
    memory.remember('a', NOW);
    memory.forget('a');
    expect(memory.has('a', NOW)).toBe(false);
  });
});

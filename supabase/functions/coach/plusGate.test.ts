// Jest tests for the Coach's Plus gate (step 189). The function around it runs
// on Deno; the decision (row, then RevenueCat) is plain TypeScript. The bug it
// fixes: a subscriber with no entitlements row got a 403 even though
// RevenueCat, and the app, said Plus.

import type { PlusLookup } from '../_shared/revenuecatLookup';

import { decidePlusGate, rowGrantsPlus } from './plusGate';

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
        eventMs: NOW,
      },
    });
    expect(lookup).toHaveBeenCalledTimes(1);
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

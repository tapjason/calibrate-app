// "Lock after" (roadmap D75): coming back within the chosen time opens
// straight in; anything else locks.

import { DEFAULT_LOCK_GRACE_MINUTES, LOCK_GRACE_MINUTES, type LockGraceMinutes } from '@/types';

import { lockOnReturn } from './lockGrace';

const AWAY = '2026-11-23T10:00:00.000Z';
const T0 = Date.parse(AWAY);
const MIN = 60_000;

const input = (over: Partial<Parameters<typeof lockOnReturn>[0]> = {}) => ({
  graceMinutes: DEFAULT_LOCK_GRACE_MINUTES,
  awaySince: AWAY,
  now: T0 + MIN,
  alreadyLocked: false,
  ...over,
});

describe('the "Lock after" choices', () => {
  it('are Immediately, 1, 5 and 15 minutes, with 5 the default', () => {
    expect(LOCK_GRACE_MINUTES).toEqual([0, 1, 5, 15]);
    expect(DEFAULT_LOCK_GRACE_MINUTES).toBe(5);
  });
});

describe('lockOnReturn', () => {
  it.each<LockGraceMinutes>([1, 5, 15])(
    'with %i minutes: opens at once, and exactly at the limit; locks 1 ms over',
    (grace) => {
      const limit = T0 + grace * MIN;
      expect(lockOnReturn(input({ graceMinutes: grace, now: T0 }))).toBe(false);
      expect(lockOnReturn(input({ graceMinutes: grace, now: T0 + 1 }))).toBe(false);
      expect(lockOnReturn(input({ graceMinutes: grace, now: limit - 1 }))).toBe(false);
      expect(lockOnReturn(input({ graceMinutes: grace, now: limit }))).toBe(false);
      expect(lockOnReturn(input({ graceMinutes: grace, now: limit + 1 }))).toBe(true);
      expect(lockOnReturn(input({ graceMinutes: grace, now: limit + 60 * MIN }))).toBe(true);
    },
  );

  it('Immediately (0) always locks, even back in the same millisecond', () => {
    for (const now of [T0, T0 + 1, T0 + MIN]) {
      expect(lockOnReturn(input({ graceMinutes: 0, now }))).toBe(true);
    }
  });

  it.each<LockGraceMinutes>([0, 1, 5, 15])('a lock already up stays up with %i minutes', (grace) => {
    expect(lockOnReturn(input({ graceMinutes: grace, now: T0, alreadyLocked: true }))).toBe(true);
  });

  it('locks with no time away', () => {
    expect(lockOnReturn(input({ awaySince: null, now: T0 }))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['not a date', 'yesterday'],
    ['a date with no time', '2026-11-23'],
    ['an instant with no zone', '2026-11-23T10:00:00'],
    ['an impossible date', '2026-13-45T10:00:00.000Z'],
    ['a number', 1_700_000_000_000],
    ['an object', { at: AWAY }],
  ])('locks on a time away that does not read: %s', (_label, value) => {
    expect(lockOnReturn(input({ awaySince: value as unknown as string, now: T0 }))).toBe(true);
  });

  it('locks on a time away in the future: the clock moved back', () => {
    expect(lockOnReturn(input({ now: T0 - 1 }))).toBe(true);
    expect(lockOnReturn(input({ now: T0 - 60 * MIN }))).toBe(true);
  });

  it('locks when the clock is not a number', () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, '1' as unknown as number]) {
      expect(lockOnReturn(input({ now }))).toBe(true);
    }
  });

  it('locks on a grace that is not one of the choices', () => {
    for (const grace of [2, 10, -1, 0.5, Number.NaN, '5', null]) {
      expect(
        lockOnReturn(input({ graceMinutes: grace as unknown as LockGraceMinutes, now: T0 })),
      ).toBe(true);
    }
  });

  it('reads an instant with an offset, or more than three digits of a second', () => {
    expect(lockOnReturn(input({ awaySince: '2026-11-23T05:00:00-05:00', now: T0 + MIN }))).toBe(false);
    expect(lockOnReturn(input({ awaySince: '2026-11-23T10:00:00.000123Z', now: T0 + MIN }))).toBe(false);
  });
});

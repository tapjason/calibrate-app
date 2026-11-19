// The runtime helpers in the shared types: the one rule for a stored instant
// (2026-11-19, re-review of round 7), which the deletion's two halves share:
// `tombstoneCovers` in src/db and sync's delete filter.

import { isStoredInstant } from './index';

describe('isStoredInstant', () => {
  it("accepts an ISO instant with its own offset, as this phone or the server writes it", () => {
    for (const ok of [
      '2026-11-17T19:00:00.000Z', // this phone
      '2026-11-17T19:00:00Z',
      '2026-11-17T19:00:00+00:00', // the server
      '2026-11-17T19:00:00.12+00:00',
      '2026-11-17T19:00:00.123456+00:00', // microseconds, Postgres's precision
      '2026-11-17T20:30:00+01:30',
      '2026-11-17T09:00:00.5-10:00',
    ]) {
      expect(isStoredInstant(ok)).toBe(true);
    }
  });

  it('refuses anything else, including times an engine could still read', () => {
    for (const bad of [
      null,
      undefined,
      42,
      new Date('2026-11-17T19:00:00.000Z'),
      '',
      '2026-11-17',
      '2026-11-17 19:00:00Z', // no T
      '2026-11-17T19:00:00', // no offset: the engine's zone would place it
      '2026-11-17T19:00:00.000', // the same, with milliseconds
      '2026-11-17T19:00Z', // no seconds
      '2026-11-17T19:00:00.1234567Z', // past microseconds
      '2026-11-17T19:00:00+0000', // offset without its colon
      '2026-11-17T19:00:00+00', // offset without its minutes
      '2026-13-45T25:61:61Z', // the right shape, but no such time
      ' 2026-11-17T19:00:00Z',
      '2026-11-17T19:00:00Z\n',
      '2026-11-17T19:00:00Z",status.eq.pending', // would leave a quoted filter value
      '+002026-11-17T19:00:00Z',
    ]) {
      expect(isStoredInstant(bad)).toBe(false);
    }
  });

  it('narrows a nullable value to a string', () => {
    const maybe: string | null = Math.random() > 2 ? null : '2026-11-17T19:00:00.000Z';
    if (isStoredInstant(maybe)) {
      const s: string = maybe;
      expect(s.length).toBe(24);
    } else {
      throw new Error('expected a stored instant');
    }
  });
});

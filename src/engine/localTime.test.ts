import {
  __setTimeZoneForTests,
  localDayNumber,
  localMidnight,
  localParts,
  utcOffsetMinutes,
} from './localTime';

afterEach(() => __setTimeZoneForTests(null));

describe('localParts', () => {
  it('reads the device zone by default (UTC under Jest)', () => {
    expect(localParts(new Date('2026-05-19T03:00:00Z'))).toEqual({
      year: 2026,
      month: 4,
      day: 19,
      weekday: 2,
    });
  });

  // The case this module exists for: 03:00 UTC Tuesday is Monday evening in
  // California.
  it('reads another zone when one is set', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    expect(localParts(new Date('2026-05-19T03:00:00Z'))).toEqual({
      year: 2026,
      month: 4,
      day: 18,
      weekday: 1,
    });
  });
});

describe('localDayNumber', () => {
  // Across the spring-forward night the local day is 23 hours long; the
  // difference must still be exactly one day.
  it('counts one day across a DST change', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const sat = localDayNumber(new Date('2026-03-07T20:00:00Z'));
    const sun = localDayNumber(new Date('2026-03-08T20:00:00Z'));
    expect(sun - sat).toBe(1);
  });
});

describe('localMidnight', () => {
  it('is plain UTC midnight in UTC', () => {
    expect(localMidnight(2026, 0, 1).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is 08:00 UTC for Pacific standard time', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    expect(localMidnight(2026, 0, 1).toISOString()).toBe('2026-01-01T08:00:00.000Z');
  });

  it('is 07:00 UTC for Pacific daylight time', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    expect(localMidnight(2026, 6, 1).toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });

  it('handles a zone ahead of UTC', () => {
    __setTimeZoneForTests('Asia/Tokyo');
    expect(localMidnight(2026, 0, 1).toISOString()).toBe('2025-12-31T15:00:00.000Z');
  });

  it('rolls month overflow into the next year', () => {
    expect(localMidnight(2026, 12, 1).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

// Owner decision 2026-11-19: stored with each moment of a prediction.
describe('utcOffsetMinutes', () => {
  it('is 0 in UTC, never -0', () => {
    expect(Object.is(utcOffsetMinutes(new Date('2026-11-19T12:00:00Z')), 0)).toBe(true);
  });

  it('is minutes east of UTC in the zone, across daylight time', () => {
    __setTimeZoneForTests('America/New_York');
    expect(utcOffsetMinutes(new Date('2026-11-19T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(-240);
    __setTimeZoneForTests('Asia/Tokyo');
    expect(utcOffsetMinutes(new Date('2026-11-19T12:00:00Z'))).toBe(540);
    __setTimeZoneForTests('Asia/Kolkata');
    expect(utcOffsetMinutes(new Date('2026-11-19T12:00:00Z'))).toBe(330);
  });

  it('is NaN for an unreadable date', () => {
    expect(utcOffsetMinutes(new Date('nope'))).toBeNaN();
  });

  // Review round 5: the server column is an integer. Monrovia kept local
  // mean time, UTC−00:44:30, until 1972.
  it('is a whole number of minutes for a zone whose offset had seconds', () => {
    __setTimeZoneForTests('Africa/Monrovia');
    const offset = utcOffsetMinutes(new Date('1970-06-01T12:00:00Z'));
    expect(Number.isInteger(offset)).toBe(true);
    expect(offset).toBe(-44);
  });
});

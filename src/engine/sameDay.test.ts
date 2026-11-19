import type { Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';

import {
  clampDueDate,
  dayNumberAt,
  earliestDueDay,
  isSameDayAnswer,
  latestDueDay,
  madeDayNumber,
  MAX_DUE_YEARS,
  readyScoredCount,
  sameDayCount,
  scoredFrom,
  scoredFromOffset,
  scoredOnly,
} from './sameDay';

// Local times, so the tests hold in any zone the suite runs in.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0, 0).toISOString();

function prediction(over: Partial<Prediction> = {}): Prediction {
  return {
    id: 'p1',
    user_id: 'u1',
    title: 'Ship it',
    category: 'work',
    confidence: 80,
    created_at: at(3, 9),
    due_date: at(4, 12),
    status: 'resolved_yes',
    resolved_at: at(4, 19),
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

describe('isSameDayAnswer (roadmap D41)', () => {
  it('is true for a Yes or No given on the local day it was logged', () => {
    expect(isSameDayAnswer(prediction({ resolved_at: at(3, 9) }))).toBe(true);
    expect(isSameDayAnswer(prediction({ status: 'resolved_no', resolved_at: at(3, 23) }))).toBe(
      true,
    );
  });

  it('is false from the next local day on, even a few minutes later', () => {
    expect(
      isSameDayAnswer(
        prediction({
          created_at: new Date(2026, 10, 3, 23, 55).toISOString(),
          resolved_at: new Date(2026, 10, 4, 0, 5).toISOString(),
        }),
      ),
    ).toBe(false);
    expect(isSameDayAnswer(prediction())).toBe(false);
  });

  it('never applies to an open prediction or a skip', () => {
    expect(isSameDayAnswer(prediction({ status: 'pending', resolved_at: null }))).toBe(false);
    expect(isSameDayAnswer(prediction({ status: 'skipped', resolved_at: at(3, 10) }))).toBe(false);
  });

  it('treats a missing or unreadable time as scored', () => {
    expect(isSameDayAnswer(prediction({ resolved_at: null }))).toBe(false);
    expect(isSameDayAnswer(prediction({ created_at: 'not a date', resolved_at: at(3, 10) }))).toBe(
      false,
    );
  });
});

describe('scoredOnly and sameDayCount', () => {
  it('drops same-day answers and keeps the rest, skips included', () => {
    const same = prediction({ id: 'same', resolved_at: at(3, 20) });
    const later = prediction({ id: 'later' });
    const skip = prediction({ id: 'skip', status: 'skipped', resolved_at: at(3, 20) });
    expect(scoredOnly([same, later, skip]).map((p) => p.id)).toEqual(['later', 'skip']);
    expect(sameDayCount([same, later, skip])).toBe(1);
  });
});

describe('clampDueDate (blind playtest 2026-11-04)', () => {
  const logged = new Date(2026, 10, 3, 19, 0);

  it('keeps a date on or after the earliest day', () => {
    const due = new Date(2026, 10, 4, 12).toISOString();
    expect(clampDueDate(due, logged, logged)).toBe(due);
  });

  it('moves today, a past date or an unreadable one to the earliest day at noon', () => {
    const earliest = new Date(2026, 10, 4, 12).toISOString();
    expect(clampDueDate(new Date(2026, 10, 3, 12).toISOString(), logged, logged)).toBe(earliest);
    expect(clampDueDate(new Date(1906, 10, 5, 12).toISOString(), logged, logged)).toBe(earliest);
    expect(clampDueDate('not a date', logged, logged)).toBe(earliest);
  });
});

// Playtest 2026-11-08, finding 6: Pick a date took 12/31/9999.
describe('latestDueDay', () => {
  it('is today at midnight, MAX_DUE_YEARS on', () => {
    expect(latestDueDay(new Date(2026, 10, 3, 19, 0))).toEqual(
      new Date(2026 + MAX_DUE_YEARS, 10, 3),
    );
  });
});

describe('earliestDueDay', () => {
  it('is the day after it was logged, at local midnight', () => {
    const logged = new Date(2026, 10, 3, 9);
    expect(earliestDueDay(logged, logged)).toEqual(new Date(2026, 10, 4, 0, 0, 0, 0));
  });

  it('is never before today, for an older prediction being edited', () => {
    const logged = new Date(2026, 9, 1, 9);
    const now = new Date(2026, 10, 3, 15);
    expect(earliestDueDay(logged, now)).toEqual(new Date(2026, 10, 3, 0, 0, 0, 0));
  });
});

describe('a reworded prediction (roadmap D45)', () => {
  it('counts as logged when it was reworded', () => {
    expect(scoredFrom(prediction())).toBe(at(3, 9));
    expect(scoredFrom(prediction({ title_edited_at: at(4, 8) }))).toBe(at(4, 8));
    // Never earlier than the logging, and an unreadable date is ignored.
    expect(scoredFrom(prediction({ title_edited_at: at(2, 8) }))).toBe(at(3, 9));
    expect(scoredFrom(prediction({ title_edited_at: 'never' }))).toBe(at(3, 9));
    expect(scoredFrom(prediction({ title_edited_at: null }))).toBe(at(3, 9));
  });

  it('is not scored when answered the day it was reworded', () => {
    // Logged on the 3rd, flipped on the due day and answered that evening.
    expect(isSameDayAnswer(prediction({ title_edited_at: at(4, 8) }))).toBe(true);
    // Reworded the day before the answer: scored, like a prediction logged then.
    expect(isSameDayAnswer(prediction({ title_edited_at: at(3, 20) }))).toBe(false);
  });
});

// Blind playtest 2026-11-13c, finding 19 (moved here from the store, code
// review step 177): what's ready now and scored if answered now, by local day.
describe('readyScoredCount', () => {
  afterEach(() => __setTimeZoneForTests(null));

  it('counts by the local day, across the end of daylight time', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    // Sun Nov 1, 20:30 PST, the evening daylight time ended; Nov 2 in UTC.
    const now = new Date('2026-11-02T04:30:00.000Z');
    const open = (created: string, due: string) =>
      prediction({ status: 'pending', resolved_at: null, created_at: created, due_date: due });
    const ready = open('2026-10-30T16:00:00.000Z', '2026-11-01T20:00:00.000Z');
    // Logged this morning, Los Angeles time: an answer now isn't scored.
    const loggedToday = open('2026-11-01T17:00:00.000Z', '2026-11-01T20:00:00.000Z');
    // Due Mon Nov 2 at 04:00 PST: tomorrow there, today in UTC.
    const tomorrow = open('2026-10-30T16:00:00.000Z', '2026-11-02T12:00:00.000Z');
    expect(readyScoredCount([ready, loggedToday, tomorrow], now)).toBe(1);
    // Reworded today counts as made today (D45).
    const reworded = { ...ready, title_edited_at: '2026-11-01T18:00:00.000Z' };
    expect(readyScoredCount([reworded], now)).toBe(0);
    // Answered or skipped: not open, not counted.
    expect(readyScoredCount([{ ...ready, status: 'skipped' }], now)).toBe(0);
  });
});

// Owner decision 2026-11-19 (record audit: 20 answers given the day they
// were logged in New York all counted once the phone was in London): each
// moment's calendar day is read in the UTC offset stored with it, and only a
// moment without one in the phone's current zone.
describe('same-day answers judged where each moment happened', () => {
  afterEach(() => __setTimeZoneForTests(null));

  const NEW_YORK = -300; // EST, November
  const LONDON = 0; // GMT, November

  /** An answer with both moments' offsets stored, as this build writes them. */
  const stored = (created: string, resolved: string, offset: number, id = 'p1') =>
    prediction({
      id,
      created_at: created,
      resolved_at: resolved,
      created_utc_offset_min: offset,
      resolved_utc_offset_min: offset,
    });

  it('keeps 20 same-day answers in New York unscored after the phone moves to London', () => {
    // Logged 09:00 and answered 22:00 New York time on Wed Nov 18; in London
    // the answer is 03:00 on Thu Nov 19.
    const twenty = Array.from({ length: 20 }, (_, i) =>
      stored('2026-11-18T14:00:00.000Z', '2026-11-19T03:00:00.000Z', NEW_YORK, `ny${i}`),
    );
    __setTimeZoneForTests('America/New_York');
    expect(scoredOnly(twenty)).toHaveLength(0);
    __setTimeZoneForTests('Europe/London');
    expect(sameDayCount(twenty)).toBe(20);
    expect(scoredOnly(twenty)).toHaveLength(0);
    // The same rows from before the offsets were stored (the bug, still the
    // reading for them): London's calendar scores all twenty.
    const legacy = twenty.map(
      ({ created_utc_offset_min: _c, resolved_utc_offset_min: _r, ...rest }) => rest,
    );
    expect(scoredOnly(legacy)).toHaveLength(20);
  });

  it('and the other way: London days stand after the phone moves to New York', () => {
    // Same-day in London: 01:00 and 23:00 on Thu Nov 19, which New York
    // reads as Wed 20:00 and Thu 18:00.
    const sameDay = stored('2026-11-19T01:00:00.000Z', '2026-11-19T23:00:00.000Z', LONDON);
    // The next day in London, 23:30 Wed then 00:30 Thu, which New York reads
    // as one Wednesday evening.
    const nextDay = stored('2026-11-18T23:30:00.000Z', '2026-11-19T00:30:00.000Z', LONDON);
    __setTimeZoneForTests('Europe/London');
    expect([isSameDayAnswer(sameDay), isSameDayAnswer(nextDay)]).toEqual([true, false]);
    __setTimeZoneForTests('America/New_York');
    expect([isSameDayAnswer(sameDay), isSameDayAnswer(nextDay)]).toEqual([true, false]);
  });

  it('scores a traveller who logs in New York and answers the next calendar day in London', () => {
    // Logged Wed Nov 18 at 20:00 in New York (01:00 Thursday in London),
    // answered Thu Nov 19 at 09:00 in London.
    const traveller = prediction({
      created_at: '2026-11-19T01:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T09:00:00.000Z',
      resolved_utc_offset_min: LONDON,
    });
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(traveller)).toBe(false);
    __setTimeZoneForTests('America/New_York');
    expect(isSameDayAnswer(traveller)).toBe(false);
  });

  it("reads a row with no stored offsets exactly as before, in the phone's zone", () => {
    const legacy = prediction({
      created_at: '2026-11-18T14:00:00.000Z',
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    __setTimeZoneForTests('America/New_York');
    expect(isSameDayAnswer(legacy)).toBe(true);
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(legacy)).toBe(false);
    // Null reads as missing too, as a pulled row from an older build has it.
    expect(
      isSameDayAnswer({ ...legacy, created_utc_offset_min: null, resolved_utc_offset_min: null }),
    ).toBe(false);
  });

  it('reads each side its own way when only one offset is known', () => {
    // Logged 09:00 Wed in New York with its offset; answered 22:00 Wed New
    // York time by a build that stored none.
    const mixed = prediction({
      created_at: '2026-11-18T14:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    __setTimeZoneForTests('America/New_York');
    expect(isSameDayAnswer(mixed)).toBe(true);
    // The answer's side is read in London: Thursday.
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(mixed)).toBe(false);
    // And the other way round: the answer's offset known, the logging's not.
    const other = prediction({
      created_at: '2026-11-18T14:00:00.000Z',
      resolved_at: '2026-11-19T03:00:00.000Z',
      resolved_utc_offset_min: NEW_YORK,
    });
    // London reads the logging as Wednesday 14:00: the answer's Wednesday.
    expect(isSameDayAnswer(other)).toBe(true);
    // Tokyo reads it as Wednesday 23:00 too; Sydney as Thursday 01:00.
    __setTimeZoneForTests('Australia/Sydney');
    expect(isSameDayAnswer(other)).toBe(false);
  });

  it('reads an unusable offset as missing', () => {
    __setTimeZoneForTests('Europe/London');
    for (const bad of [841, -841, 1.5, Number.NaN]) {
      const p = stored('2026-11-18T14:00:00.000Z', '2026-11-19T03:00:00.000Z', bad);
      // Both sides fall back to London: Wednesday and Thursday.
      expect(isSameDayAnswer(p)).toBe(false);
    }
  });

  it("uses the rewording's own offset when the words are the later moment (D45)", () => {
    // Logged Monday in London; reworded Wed 21:00 in New York (Thu 02:00 in
    // London); answered Wed 23:00 in New York.
    const reworded = prediction({
      created_at: '2026-11-16T09:00:00.000Z',
      created_utc_offset_min: LONDON,
      title_edited_at: '2026-11-19T02:00:00.000Z',
      title_edited_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T04:00:00.000Z',
      resolved_utc_offset_min: NEW_YORK,
    });
    expect(scoredFromOffset(reworded)).toBe(NEW_YORK);
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(reworded)).toBe(true);
    // An earlier rewording leaves the logging's moment and offset in charge.
    const early = { ...reworded, title_edited_at: '2026-11-10T09:00:00.000Z' };
    expect(scoredFromOffset(early)).toBe(LONDON);
    expect(madeDayNumber(early)).toBe(dayNumberAt(new Date('2026-11-16T09:00:00.000Z'), LONDON));
    expect(isSameDayAnswer(early)).toBe(false);
  });

  it('counts what is ready and scored now by the day it was made, where it was made', () => {
    __setTimeZoneForTests('Europe/London');
    // Thu Nov 19, 10:00 in London.
    const now = new Date('2026-11-19T10:00:00.000Z');
    const open = (created: string, offset?: number) =>
      prediction({
        status: 'pending',
        resolved_at: null,
        created_at: created,
        due_date: '2026-11-19T12:00:00.000Z',
        ...(offset === undefined ? {} : { created_utc_offset_min: offset }),
      });
    // Logged Wed 22:00 in New York, which London reads as 03:00 today: made
    // yesterday where it was made, so an answer now is scored.
    expect(readyScoredCount([open('2026-11-19T03:00:00.000Z', NEW_YORK)], now)).toBe(1);
    // Without the offset, London's reading stands: made today.
    expect(readyScoredCount([open('2026-11-19T03:00:00.000Z')], now)).toBe(0);
  });
});

describe('dayNumberAt', () => {
  afterEach(() => __setTimeZoneForTests(null));

  it("reads the calendar day in a stored offset, else in the phone's zone", () => {
    const t = new Date('2026-11-19T03:00:00.000Z');
    const thu = Math.round(Date.UTC(2026, 10, 19) / 86_400_000);
    expect(dayNumberAt(t, 0)).toBe(thu);
    expect(dayNumberAt(t, -300)).toBe(thu - 1);
    expect(dayNumberAt(t, 840)).toBe(thu);
    __setTimeZoneForTests('America/Los_Angeles');
    expect(dayNumberAt(t)).toBe(thu - 1);
    expect(dayNumberAt(t, null)).toBe(thu - 1);
    expect(dayNumberAt(new Date('nope'), 0)).toBeNaN();
  });
});

describe('earliestDueDay with the offset it was logged in', () => {
  it('is the day after the calendar day it was made on, where it was made', () => {
    // Logged Wed Nov 18 at 20:00 in New York: 01:00 Thursday in UTC (the
    // phone's zone under Jest). Thursday is the next day where it was made.
    const logged = new Date('2026-11-19T01:00:00.000Z');
    const wed = new Date('2026-11-18T12:00:00.000Z');
    expect(earliestDueDay(logged, wed, -300)).toEqual(new Date(2026, 10, 19));
    // Without the offset the phone's own day is the logging day: Friday.
    expect(earliestDueDay(logged, wed)).toEqual(new Date(2026, 10, 20));
    // Never before today.
    expect(earliestDueDay(logged, new Date(2026, 10, 25, 9), -300)).toEqual(
      new Date(2026, 10, 25),
    );
    // The clamp takes the same floor.
    const thursdayNoon = new Date(2026, 10, 19, 12).toISOString();
    expect(clampDueDate(thursdayNoon, logged, wed, -300)).toBe(thursdayNoon);
    expect(clampDueDate(thursdayNoon, logged, wed)).toBe(new Date(2026, 10, 20, 12).toISOString());
  });

  it("agrees with the phone's own day when the offset is the phone's", () => {
    const logged = new Date(2026, 10, 3, 9);
    expect(earliestDueDay(logged, logged, 0)).toEqual(earliestDueDay(logged, logged));
  });
});

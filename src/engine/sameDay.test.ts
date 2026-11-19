import type { Prediction } from '@/types';

import { __setTimeZoneForTests, localDayNumber, utcOffsetMinutes } from './localTime';

import {
  clampDueDate,
  dayNumberAt,
  dayNumberWhereMade,
  earliestDueDay,
  isOnLoggedDay,
  isOnMadeDay,
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

// Owner decision 2026-11-19, refined in review round 6: "the same day" is read
// only in the zone the prediction was made in (the logging offset, or the
// rewording's, D45), for both the day it was made and the day of the answer.
// Round 5 read the answer in its own zone, which the record auditor turned
// into 20 scored same-day answers by moving the phone to UTC+14. A row with
// no logging offset is read in the phone's current zone, exactly as before
// D69.
describe('same-day answers judged in the zone the prediction was made in', () => {
  afterEach(() => __setTimeZoneForTests(null));

  const NEW_YORK = -300; // EST, November
  const LONDON = 0; // GMT, November

  /** An answer with its logging offset stored, as this build writes it. */
  const stored = (created: string, resolved: string, offset: number, id = 'p1') =>
    prediction({
      id,
      created_at: created,
      resolved_at: resolved,
      created_utc_offset_min: offset,
    });

  // The record auditor's padding route (round 6): 20 sure things logged at
  // 08:00 in New York, the phone set to UTC+14, answered at once. In
  // Kiritimati it is already 03:05 the next day; in New York, 08:05 the same
  // day. Judged where they were made: none scored.
  it("leaves the auditor's 20 answers unscored after the phone is set to UTC+14", () => {
    // Wed Nov 18, 08:00 in New York, logged there.
    __setTimeZoneForTests('America/New_York');
    const loggedAt = '2026-11-18T13:00:00.000Z';
    const offset = utcOffsetMinutes(new Date(loggedAt));
    expect(offset).toBe(NEW_YORK);
    const twenty = Array.from({ length: 20 }, (_, i) =>
      stored(loggedAt, '2026-11-18T13:05:00.000Z', offset, `pad${i}`),
    );
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York', 'Europe/London']) {
      __setTimeZoneForTests(zone);
      expect({ zone, scored: scoredOnly(twenty).length }).toEqual({ zone, scored: 0 });
      expect(sameDayCount(twenty)).toBe(20);
    }
  });

  it('leaves a traveller unscored until the next day has begun where it was logged, then scores', () => {
    // Logged Wed Nov 18 at 20:00 in New York (Thu 01:00 UTC); the phone is
    // now in London.
    const logged = '2026-11-19T01:00:00.000Z';
    __setTimeZoneForTests('Europe/London');
    // Thu 03:00 in London is Wed 22:00 in New York: the day it was logged.
    expect(isSameDayAnswer(stored(logged, '2026-11-19T03:00:00.000Z', NEW_YORK))).toBe(true);
    // One minute before midnight in New York, still the day it was logged.
    expect(isSameDayAnswer(stored(logged, '2026-11-19T04:59:00.000Z', NEW_YORK))).toBe(true);
    // Thu 05:00 in London is midnight in New York: scored from then.
    expect(isSameDayAnswer(stored(logged, '2026-11-19T05:00:00.000Z', NEW_YORK))).toBe(false);
    expect(isSameDayAnswer(stored(logged, '2026-11-19T09:00:00.000Z', NEW_YORK))).toBe(false);
  });

  it('reads the answer in the logging offset whatever zone it was given in', () => {
    // Logged 09:00 Wed in New York, answered 22:00 Wed New York time: the
    // same day there, wherever the phone is when it answers or reads.
    const p = stored('2026-11-18T14:00:00.000Z', '2026-11-19T03:00:00.000Z', NEW_YORK);
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney', 'Pacific/Kiritimati']) {
      __setTimeZoneForTests(zone);
      expect({ zone, same: isSameDayAnswer(p) }).toEqual({ zone, same: true });
    }
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
    const legacy = twenty.map(({ created_utc_offset_min: _c, ...rest }) => rest);
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
    // answered Thu Nov 19 at 09:00 in London: 04:00 Thursday in New York,
    // the next day where it was logged.
    const traveller = prediction({
      created_at: '2026-11-19T01:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T09:00:00.000Z',
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
    expect(isSameDayAnswer({ ...legacy, created_utc_offset_min: null })).toBe(false);
  });

  // "Legacy rows behave exactly as before D69": with no logging offset, the
  // rule is the pre-D69 one, both days in the phone's zone, across zones,
  // rewordings and moments near midnight.
  it('matches the pre-D69 rule on every row without a logging offset', () => {
    const before = (p: Prediction) =>
      (p.status === 'resolved_yes' || p.status === 'resolved_no') &&
      p.resolved_at !== null &&
      localDayNumber(new Date(p.resolved_at)) === localDayNumber(new Date(scoredFrom(p)));
    const instants = [
      '2026-11-18T00:30:00.000Z',
      '2026-11-18T04:59:00.000Z',
      '2026-11-18T05:00:00.000Z',
      '2026-11-18T13:00:00.000Z',
      '2026-11-18T23:59:00.000Z',
      '2026-11-19T00:01:00.000Z',
      '2026-11-19T14:30:00.000Z',
    ];
    const rows: Prediction[] = [];
    for (const created of instants) {
      for (const resolved of instants) {
        if (resolved < created) continue;
        rows.push(prediction({ created_at: created, resolved_at: resolved }));
        rows.push(prediction({ created_at: created, resolved_at: resolved, status: 'resolved_no' }));
        // Reworded between the two, with no offset of its own: the phone's
        // zone for both sides too.
        rows.push(
          prediction({
            created_at: '2026-11-16T09:00:00.000Z',
            created_utc_offset_min: NEW_YORK,
            title_edited_at: created,
            resolved_at: resolved,
          }),
        );
      }
    }
    for (const zone of ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kolkata']) {
      __setTimeZoneForTests(zone);
      for (const p of rows) {
        expect({ zone, p, same: isSameDayAnswer(p) }).toEqual({ zone, p, same: before(p) });
      }
    }
  });

  // Round 6 (replacing round 5's "each side its own way"): the logging
  // offset, when known, reads both sides; the answer's zone never counts.
  it('reads both sides in the logging offset when only it is known, whatever the phone', () => {
    // Logged 09:00 Wed in New York; answered 22:00 Wed New York time.
    const mixed = prediction({
      created_at: '2026-11-18T14:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
      __setTimeZoneForTests(zone);
      expect({ zone, same: isSameDayAnswer(mixed) }).toEqual({ zone, same: true });
    }
    // Without the logging offset both sides are the phone's: London reads
    // Wednesday 14:00 and Thursday 03:00, Sydney Thursday 01:00 and 14:00.
    const { created_utc_offset_min: _c, ...legacy } = mixed;
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(legacy)).toBe(false);
    __setTimeZoneForTests('Australia/Sydney');
    expect(isSameDayAnswer(legacy)).toBe(true);
  });

  it('reads both sides in the phone zone when the words are the later moment and carry no offset', () => {
    // Logged Monday in New York with its offset; reworded Wed 14:00 UTC by a
    // build or phone that stored no offset for it; answered Thu 03:00 UTC.
    const p = prediction({
      created_at: '2026-11-16T14:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      title_edited_at: '2026-11-18T14:00:00.000Z',
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    expect(scoredFromOffset(p)).toBeNull();
    // New York reads Wed 09:00 and Wed 22:00: the same day.
    __setTimeZoneForTests('America/New_York');
    expect(isSameDayAnswer(p)).toBe(true);
    // London reads Wed 14:00 and Thu 03:00: scored.
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(p)).toBe(false);
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
    // London); answered Wed 23:00 New York time (Thu 04:00 in London).
    const reworded = prediction({
      created_at: '2026-11-16T09:00:00.000Z',
      created_utc_offset_min: LONDON,
      title_edited_at: '2026-11-19T02:00:00.000Z',
      title_edited_utc_offset_min: NEW_YORK,
      resolved_at: '2026-11-19T04:00:00.000Z',
    });
    expect(scoredFromOffset(reworded)).toBe(NEW_YORK);
    __setTimeZoneForTests('Europe/London');
    expect(isSameDayAnswer(reworded)).toBe(true);
    // Answered Thu 08:00 in London, 03:00 Thursday in New York: the next day
    // where it was reworded, so scored, though the logging was in London.
    expect(isSameDayAnswer({ ...reworded, resolved_at: '2026-11-19T08:00:00.000Z' })).toBe(false);
    // An earlier rewording leaves the logging's moment and offset in charge.
    const early = { ...reworded, title_edited_at: '2026-11-10T09:00:00.000Z' };
    expect(scoredFromOffset(early)).toBe(LONDON);
    expect(madeDayNumber(early)).toBe(dayNumberAt(new Date('2026-11-16T09:00:00.000Z'), LONDON));
    expect(isSameDayAnswer(early)).toBe(false);
  });

  // Daylight saving: the stored offset is the one in force when it was
  // logged, so the day boundary moves by the change (sameDay.ts, "Known
  // limit"). America/New_York, 2026: clocks go back Sun Nov 1 at 02:00 EDT,
  // forward Sun Mar 8 at 02:00 EST.
  describe('across a daylight saving change', () => {
    const loggedInNewYork = (createdIso: string, resolvedIso: string) => {
      __setTimeZoneForTests('America/New_York');
      return stored(createdIso, resolvedIso, utcOffsetMinutes(new Date(createdIso)));
    };

    it('reads the evening before clocks go back and the morning after as the days they were', () => {
      // Logged Sat Oct 31 at 20:00 EDT (−240).
      const logged = '2026-11-01T00:00:00.000Z';
      // Sat 23:00 EDT: the same day.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-11-01T03:00:00.000Z'))).toBe(true);
      // Sun 08:00 EST: the next day.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-11-01T13:00:00.000Z'))).toBe(false);
    });

    it('keeps the first hour after clocks go forward on the day it was made: unscored, the safe side', () => {
      // Logged Sun Mar 8 at 01:00 EST (−300), before the change.
      const logged = '2026-03-08T06:00:00.000Z';
      expect(loggedInNewYork(logged, logged).created_utc_offset_min).toBe(-300);
      // Mon Mar 9 at 00:30 EDT reads as Sun 23:30 at −300: unscored.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-03-09T04:30:00.000Z'))).toBe(true);
      // Mon 01:30 EDT reads as Mon 00:30: scored.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-03-09T05:30:00.000Z'))).toBe(false);
    });

    // The one way the stored offset scores a same-day answer: logged in the
    // night before clocks go back, answered in that day's last hour. Pinned
    // so a change to it is deliberate.
    it('known limit: logged before clocks go back, answered in that day’s last hour, reads as the next day', () => {
      // Logged Sun Nov 1 at 01:30 EDT (−240), before the change.
      const logged = '2026-11-01T05:30:00.000Z';
      expect(loggedInNewYork(logged, logged).created_utc_offset_min).toBe(-240);
      // Sun 22:30 EST reads as 23:30 at −240: the same day.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-11-02T03:30:00.000Z'))).toBe(true);
      // Sun 23:30 EST reads as Mon 00:30 at −240: scored.
      expect(isSameDayAnswer(loggedInNewYork(logged, '2026-11-02T04:30:00.000Z'))).toBe(false);
    });
  });

  describe('in a zone a half or three quarters of an hour off UTC', () => {
    const loggedIn = (zone: string, createdIso: string, resolvedIso: string) => {
      __setTimeZoneForTests(zone);
      return stored(createdIso, resolvedIso, utcOffsetMinutes(new Date(createdIso)));
    };

    it('turns the day at local midnight in India (+5:30), wherever the phone is later', () => {
      // Logged Thu Nov 19 at 23:45 IST.
      const before = loggedIn('Asia/Kolkata', '2026-11-19T18:15:00.000Z', '2026-11-19T18:25:00.000Z');
      const after = loggedIn('Asia/Kolkata', '2026-11-19T18:15:00.000Z', '2026-11-19T18:40:00.000Z');
      expect(before.created_utc_offset_min).toBe(330);
      for (const zone of ['Asia/Kolkata', 'Europe/London', 'America/Los_Angeles']) {
        __setTimeZoneForTests(zone);
        // 23:55 IST: the same day. 00:10 IST Friday: the next.
        expect({ zone, before: isSameDayAnswer(before), after: isSameDayAnswer(after) }).toEqual({
          zone,
          before: true,
          after: false,
        });
      }
    });

    it('turns the day at local midnight in Newfoundland (−3:30) and Nepal (+5:45)', () => {
      // Logged Wed Nov 18 at 23:50 NST (−210): 23:59 the same day, 00:20 the next.
      const nst = '2026-11-19T03:20:00.000Z';
      expect(loggedIn('America/St_Johns', nst, nst).created_utc_offset_min).toBe(-210);
      expect(isSameDayAnswer(loggedIn('America/St_Johns', nst, '2026-11-19T03:29:00.000Z'))).toBe(true);
      expect(isSameDayAnswer(loggedIn('America/St_Johns', nst, '2026-11-19T03:50:00.000Z'))).toBe(false);
      // Logged Thu Nov 19 at 23:50 NPT (+345): 23:59 the same day, 00:05 the next.
      const npt = '2026-11-19T18:05:00.000Z';
      expect(loggedIn('Asia/Kathmandu', npt, npt).created_utc_offset_min).toBe(345);
      expect(isSameDayAnswer(loggedIn('Asia/Kathmandu', npt, '2026-11-19T18:14:00.000Z'))).toBe(true);
      expect(isSameDayAnswer(loggedIn('Asia/Kathmandu', npt, '2026-11-19T18:20:00.000Z'))).toBe(false);
    });
  });

  it('reads a day where it was made with dayNumberWhereMade and isOnMadeDay', () => {
    const p = prediction({ created_at: '2026-11-19T01:00:00.000Z', created_utc_offset_min: NEW_YORK });
    const wed = Math.round(Date.UTC(2026, 10, 18) / 86_400_000);
    __setTimeZoneForTests('Asia/Tokyo');
    expect(madeDayNumber(p)).toBe(wed);
    expect(dayNumberWhereMade(p, new Date('2026-11-19T04:59:00.000Z'))).toBe(wed);
    expect(isOnMadeDay(p, new Date('2026-11-19T04:59:00.000Z'))).toBe(true);
    expect(isOnMadeDay(p, new Date('2026-11-19T05:00:00.000Z'))).toBe(false);
    expect(isOnMadeDay(p, new Date('nope'))).toBe(false);
    expect(isOnMadeDay({ ...p, created_at: 'nope' }, new Date('2026-11-19T04:00:00.000Z'))).toBe(false);
  });

  // Review round 7 (owner decision 2026-11-19): the day it was logged, which
  // new words don't move, for the delete and category-move exemptions.
  it('reads the day it was logged with isOnLoggedDay, in the logging offset, never the rewording', () => {
    // Logged Wed Nov 18 at 20:00 in New York; reworded Thu Nov 19 at 13:10 in
    // Tokyo (04:10 UTC, 23:10 Wednesday in New York).
    const p = prediction({
      created_at: '2026-11-19T01:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
      title_edited_at: '2026-11-19T04:10:00.000Z',
      title_edited_utc_offset_min: 540,
    });
    __setTimeZoneForTests('Asia/Tokyo');
    // 23:59 Wednesday in New York: still the day it was logged.
    expect(isOnLoggedDay(p, new Date('2026-11-19T04:59:00.000Z'))).toBe(true);
    // 00:00 Thursday in New York: the next day, though it is the day of the
    // rewording where it was reworded (isOnMadeDay reads that one).
    expect(isOnLoggedDay(p, new Date('2026-11-19T05:00:00.000Z'))).toBe(false);
    expect(isOnMadeDay(p, new Date('2026-11-19T05:00:00.000Z'))).toBe(true);
    // Unreadable on either side: not that day.
    expect(isOnLoggedDay(p, new Date('nope'))).toBe(false);
    expect(isOnLoggedDay({ ...p, created_at: 'nope' }, new Date('2026-11-19T04:00:00.000Z'))).toBe(false);
    // No stored offset: both read in the phone's zone (Tokyo here, where the
    // logging was Thu 10:00).
    const legacy = prediction({ created_at: '2026-11-19T01:00:00.000Z' });
    expect(isOnLoggedDay(legacy, new Date('2026-11-19T14:59:00.000Z'))).toBe(true);
    expect(isOnLoggedDay(legacy, new Date('2026-11-19T15:00:00.000Z'))).toBe(false);
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

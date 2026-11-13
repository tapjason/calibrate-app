import type { Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';

import {
  clampDueDate,
  earliestDueDay,
  isSameDayAnswer,
  latestDueDay,
  MAX_DUE_YEARS,
  readyScoredCount,
  sameDayCount,
  scoredFrom,
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

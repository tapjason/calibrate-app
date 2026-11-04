import type { Prediction } from '@/types';

import {
  clampDueDate,
  earliestDueDay,
  isSameDayAnswer,
  sameDayCount,
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

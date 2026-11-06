import type { Prediction } from '@/types';

import {
  canAnswerSkip,
  canCorrect,
  correctableUntil,
  CORRECTION_WINDOW_HOURS,
  deletionCounts,
  SKIP_ANSWER_DAYS,
  skipLastDay,
} from './corrections';

const answered = (over: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: 'u1',
  title: 'x',
  category: 'work',
  confidence: 70,
  created_at: '2026-10-30T12:00:00.000Z',
  due_date: '2026-11-01T12:00:00.000Z',
  status: 'resolved_no',
  resolved_at: '2026-11-01T18:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...over,
});

describe('corrections (roadmap D34)', () => {
  it('keeps a Yes or No open to correction for 24 hours after the answer', () => {
    expect(CORRECTION_WINDOW_HOURS).toBe(24);
    expect(correctableUntil(answered())?.toISOString()).toBe('2026-11-02T18:00:00.000Z');
    expect(canCorrect(answered(), new Date('2026-11-02T17:59:59.000Z'))).toBe(true);
    expect(canCorrect(answered(), new Date('2026-11-02T18:00:00.000Z'))).toBe(false);
    expect(canCorrect(answered({ status: 'resolved_yes' }), new Date('2026-11-01T19:00:00.000Z'))).toBe(true);
  });

  // A skip is answered later instead (step 39); an open one has nothing to correct.
  it('has no window for an open prediction, a skip or an unreadable time', () => {
    const now = new Date('2026-11-01T19:00:00.000Z');
    expect(canCorrect(answered({ status: 'pending', resolved_at: null }), now)).toBe(false);
    expect(canCorrect(answered({ status: 'skipped' }), now)).toBe(false);
    expect(correctableUntil(answered({ resolved_at: 'never' }))).toBeNull();
  });
});

// Local times, so these hold in any zone the suite runs in.
const local = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0, 0);

describe('answering a skip later (roadmap D45)', () => {
  const skip = (over: Partial<Prediction> = {}) =>
    answered({
      status: 'skipped',
      created_at: local(1, 9).toISOString(),
      due_date: local(3, 12).toISOString(),
      resolved_at: local(3, 19).toISOString(),
      ...over,
    });

  it('stays open through the seventh day after the due day', () => {
    expect(SKIP_ANSWER_DAYS).toBe(7);
    expect(skipLastDay(skip())?.getTime()).toBe(new Date(2026, 10, 10).getTime());
    expect(canAnswerSkip(skip(), local(10, 23))).toBe(true);
    expect(canAnswerSkip(skip(), local(11, 0))).toBe(false);
  });

  it('keeps the correction day for a skip given late, to undo a mis-tap', () => {
    // Due on the 3rd, skipped on the 20th while clearing a backlog.
    const late = skip({ resolved_at: local(20, 19).toISOString() });
    expect(canAnswerSkip(late, local(21, 12))).toBe(true);
    expect(canAnswerSkip(late, local(22, 0))).toBe(false);
  });

  it('has no deadline for anything but a skip', () => {
    expect(skipLastDay(answered())).toBeNull();
    expect(canAnswerSkip(answered({ status: 'pending', resolved_at: null }), local(3, 12))).toBe(false);
    expect(skipLastDay(skip({ due_date: 'never' }))).toBeNull();
  });
});

describe('which deletions are counted (roadmap D45)', () => {
  const now = local(5, 12);

  it('counts a scored Yes or No', () => {
    const scored = answered({
      created_at: local(1, 9).toISOString(),
      resolved_at: local(4, 19).toISOString(),
    });
    expect(deletionCounts(scored, now)).toBe(true);
    expect(deletionCounts({ ...scored, status: 'resolved_yes' }, now)).toBe(true);
  });

  it("doesn't count a same-day answer or a skip, which were never scored", () => {
    const sameDay = answered({
      created_at: local(4, 9).toISOString(),
      resolved_at: local(4, 19).toISOString(),
    });
    expect(deletionCounts(sameDay, now)).toBe(false);
    expect(deletionCounts(answered({ status: 'skipped' }), now)).toBe(false);
  });

  it('counts an open one from its due day on, not before', () => {
    const open = (day: number) =>
      answered({ status: 'pending', resolved_at: null, due_date: local(day, 12).toISOString() });
    expect(deletionCounts(open(6), now)).toBe(false);
    expect(deletionCounts(open(5), now)).toBe(true);
    expect(deletionCounts(open(2), now)).toBe(true);
  });
});

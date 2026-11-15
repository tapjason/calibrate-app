import type { Prediction } from '@/types';

import {
  canAnswerSkip,
  canCorrect,
  correctableUntil,
  CORRECTION_WINDOW_HOURS,
  deletionCounts,
  postponementCounts,
  rewordingCounts,
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

  // D61 (record audit 2026-11-13): from the eve, as a counted due-date move.
  it('counts an open one from the day before its due day, not earlier', () => {
    const open = (day: number) =>
      answered({
        status: 'pending',
        resolved_at: null,
        created_at: local(1, 9).toISOString(),
        due_date: local(day, 12).toISOString(),
      });
    expect(deletionCounts(open(7), now)).toBe(false);
    expect(deletionCounts(open(6), now)).toBe(true);
    expect(deletionCounts(open(5), now)).toBe(true);
    expect(deletionCounts(open(2), now)).toBe(true);
  });

  // Record audit, 2026-11-15: the day-made exemption is for the eve only. One
  // made today and already due (a clock or time-zone change, a synced row)
  // is counted, on a delete and on new words; Edit's rewording note relies on it.
  it('counts one made today that is already due today', () => {
    const dueToday = answered({
      status: 'pending',
      resolved_at: null,
      created_at: local(5, 9).toISOString(),
      due_date: local(5, 12).toISOString(),
    });
    expect(deletionCounts(dueToday, now)).toBe(true);
    expect(rewordingCounts(dueToday, now)).toBe(true);
  });

  it("doesn't count one deleted on the eve the day it was made, or reworded", () => {
    const fresh = answered({
      status: 'pending',
      resolved_at: null,
      created_at: local(5, 9).toISOString(),
      due_date: local(6, 12).toISOString(),
    });
    expect(deletionCounts(fresh, now)).toBe(false);
    const reworded = { ...fresh, created_at: local(1, 9).toISOString(), title_edited_at: local(5, 10).toISOString() };
    expect(deletionCounts(reworded, now)).toBe(false);
  });
});

// Step 173 (aggregate B1): a due date moved later once the outcome may be known.
describe('postponementCounts', () => {
  const at = (d: string) => new Date(`${d}T12:00:00`);
  const iso = (d: string) => at(d).toISOString();
  it('counts a move later made the day before the due day or after', () => {
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-20'), at('2026-11-13'))).toBe(true);
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-15'), at('2026-11-14'))).toBe(true);
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-20'), at('2026-11-16'))).toBe(true);
  });
  it('leaves an early move alone, and a move earlier at any time', () => {
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-20'), at('2026-11-12'))).toBe(false);
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-13'), at('2026-11-13'))).toBe(false);
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-14'), at('2026-11-14'))).toBe(false);
  });
  it('leaves a move on the day it was made alone (D62)', () => {
    // Logged due tomorrow, moved to Monday two minutes later (round 21, run 5).
    const made = new Date('2026-11-13T22:20:00').toISOString();
    expect(
      postponementCounts(iso('2026-11-14'), iso('2026-11-16'), new Date('2026-11-13T22:22:00'), made),
    ).toBe(false);
    // Made the day before: counted as before.
    expect(
      postponementCounts(iso('2026-11-14'), iso('2026-11-16'), at('2026-11-13'), iso('2026-11-12')),
    ).toBe(true);
    // An unreadable made time doesn't exempt it.
    expect(postponementCounts(iso('2026-11-14'), iso('2026-11-16'), at('2026-11-13'), 'nope')).toBe(
      true,
    );
  });
});

describe('rewordingCounts (D62)', () => {
  const open = (over: Partial<Prediction> = {}): Prediction => ({
    ...answered(),
    status: 'pending',
    resolved_at: null,
    created_at: new Date('2026-11-10T09:00:00').toISOString(),
    due_date: new Date('2026-11-14T12:00:00').toISOString(),
    ...over,
  });
  it('counts new words on the eve of the due day or after', () => {
    expect(rewordingCounts(open(), new Date('2026-11-13T20:00:00'))).toBe(true);
    expect(rewordingCounts(open(), new Date('2026-11-14T08:00:00'))).toBe(true);
  });
  it('leaves earlier rewording alone, and the day it was made', () => {
    expect(rewordingCounts(open(), new Date('2026-11-12T20:00:00'))).toBe(false);
    const madeOnEve = open({ created_at: new Date('2026-11-13T09:00:00').toISOString() });
    expect(rewordingCounts(madeOnEve, new Date('2026-11-13T20:00:00'))).toBe(false);
    // Reworded earlier today counts as made today (D45).
    const rewordedToday = open({ title_edited_at: new Date('2026-11-13T10:00:00').toISOString() });
    expect(rewordingCounts(rewordedToday, new Date('2026-11-13T20:00:00'))).toBe(false);
  });
  it('never counts an answered one', () => {
    expect(rewordingCounts(answered(), new Date('2026-11-01T20:00:00'))).toBe(false);
  });
});

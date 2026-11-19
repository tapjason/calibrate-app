import type { Prediction } from '@/types';

import {
  answeredAwayFromOrigin,
  canAnswerSkip,
  canCorrect,
  categoryChangeCountedIfAnswered,
  categoryChangeCounts,
  categoryChangeRemembered,
  correctableUntil,
  CORRECTION_WINDOW_HOURS,
  deletionCounts,
  postponementCounts,
  refileCounts,
  rewordingCounts,
  SKIP_ANSWER_DAYS,
  skipLastDay,
} from './corrections';
import { __setTimeZoneForTests } from './localTime';

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

// Step 184 (D65): a scored answer moved to another category is counted.
describe('refileCounts', () => {
  it('counts a scored Yes or No', () => {
    expect(refileCounts(answered())).toBe(true);
    expect(refileCounts(answered({ status: 'resolved_yes' }))).toBe(true);
  });
  it('leaves a same-day answer, a skip and an open one alone: none was scored', () => {
    const sameDay = answered({
      created_at: new Date('2026-11-01T09:00:00').toISOString(),
      resolved_at: new Date('2026-11-01T19:00:00').toISOString(),
    });
    expect(refileCounts(sameDay)).toBe(false);
    expect(refileCounts(answered({ status: 'skipped' }))).toBe(false);
    expect(refileCounts(answered({ status: 'pending', resolved_at: null }))).toBe(false);
  });
});

// Owner decision 2026-11-19 (record audit: a likely miss moved to another
// category before it was answered left no trace): counted like a late move.
describe('categoryChangeCounts', () => {
  const open = (over: Partial<Prediction> = {}): Prediction => ({
    ...answered(),
    status: 'pending',
    resolved_at: null,
    created_at: new Date('2026-11-10T09:00:00').toISOString(),
    due_date: new Date('2026-11-14T12:00:00').toISOString(),
    ...over,
  });

  it('counts a change on the eve of the due day or after', () => {
    expect(categoryChangeCounts(open(), new Date('2026-11-13T20:00:00'))).toBe(true);
    expect(categoryChangeCounts(open(), new Date('2026-11-14T08:00:00'))).toBe(true);
    expect(categoryChangeCounts(open(), new Date('2026-11-16T08:00:00'))).toBe(true);
  });

  it('leaves one two days before the due day alone', () => {
    expect(categoryChangeCounts(open(), new Date('2026-11-12T23:00:00'))).toBe(false);
  });

  it('leaves a change on the day it was made, or last reworded, alone (D62)', () => {
    const madeOnEve = open({ created_at: new Date('2026-11-13T09:00:00').toISOString() });
    expect(categoryChangeCounts(madeOnEve, new Date('2026-11-13T20:00:00'))).toBe(false);
    const rewordedToday = open({ title_edited_at: new Date('2026-11-13T10:00:00').toISOString() });
    expect(categoryChangeCounts(rewordedToday, new Date('2026-11-13T20:00:00'))).toBe(false);
    // As for a late move, the exemption holds on the due day too.
    const madeOnDueDay = open({ created_at: new Date('2026-11-14T07:00:00').toISOString() });
    expect(categoryChangeCounts(madeOnDueDay, new Date('2026-11-14T08:00:00'))).toBe(false);
  });

  it('never counts an answered one, and not on an unreadable due date', () => {
    expect(categoryChangeCounts(answered(), new Date('2026-11-01T20:00:00'))).toBe(false);
    expect(categoryChangeCounts(open({ due_date: 'never' }), new Date('2026-11-13T20:00:00'))).toBe(
      false,
    );
    // An unreadable made time doesn't exempt it, as for a move.
    expect(categoryChangeCounts(open({ created_at: 'nope' }), new Date('2026-11-13T20:00:00'))).toBe(
      true,
    );
  });
});

// Owner decision 2026-11-19: the day a prediction was made is read where it
// was made, for the late-change exemptions as for the same-day rule.
describe('the day made, read in its stored offset', () => {
  afterEach(() => __setTimeZoneForTests(null));

  it('exempts a change on the day it was made where it was made, not where the phone is now', () => {
    __setTimeZoneForTests('Europe/London');
    // Due Fri Nov 20 at noon in London; now Thu Nov 19, 09:00 in London: the eve.
    const now = new Date('2026-11-19T09:00:00.000Z');
    const p = (created: string, offset?: number): Prediction => ({
      ...answered(),
      status: 'pending',
      resolved_at: null,
      created_at: created,
      due_date: '2026-11-20T12:00:00.000Z',
      ...(offset === undefined ? {} : { created_utc_offset_min: offset }),
    });
    // Logged Wed 22:00 in New York, which London reads as 03:00 today. Where
    // it was made, that was yesterday: a change today is late.
    const fromNewYork = p('2026-11-19T03:00:00.000Z', -300);
    expect(categoryChangeCounts(fromNewYork, now)).toBe(true);
    expect(rewordingCounts(fromNewYork, now)).toBe(true);
    expect(deletionCounts(fromNewYork, now)).toBe(true);
    expect(
      postponementCounts(fromNewYork.due_date, '2026-11-25T12:00:00.000Z', now, fromNewYork.created_at, -300),
    ).toBe(true);
    // A row with no offset is read in London, as before: made today, exempt.
    const legacy = p('2026-11-19T03:00:00.000Z');
    expect(categoryChangeCounts(legacy, now)).toBe(false);
    expect(rewordingCounts(legacy, now)).toBe(false);
    expect(deletionCounts(legacy, now)).toBe(false);
    expect(postponementCounts(legacy.due_date, '2026-11-25T12:00:00.000Z', now, legacy.created_at)).toBe(
      false,
    );
  });

  // Review round 6 (record audit: a fix 30 minutes after logging was counted
  // for a traveller): "made today" reads today in the zone it was made in
  // too, so the day doesn't end early when the phone has moved east.
  it('exempts a change 30 minutes after logging for a traveller, and counts it once the day there has passed', () => {
    __setTimeZoneForTests('Europe/London');
    // Logged Wed Nov 18 at 23:00 in New York (Thu 04:00 UTC), due Fri Nov 20.
    const p: Prediction = {
      ...answered(),
      status: 'pending',
      resolved_at: null,
      created_at: '2026-11-19T04:00:00.000Z',
      created_utc_offset_min: -300,
      due_date: '2026-11-20T12:00:00.000Z',
    };
    const later = '2026-11-25T12:00:00.000Z';
    // Thu 04:30 in London, the eve of the due day there; 23:30 Wednesday in
    // New York, the day it was made.
    const halfHour = new Date('2026-11-19T04:30:00.000Z');
    expect(postponementCounts(p.due_date, later, halfHour, p.created_at, -300)).toBe(false);
    expect(categoryChangeCounts(p, halfHour)).toBe(false);
    expect(rewordingCounts(p, halfHour)).toBe(false);
    expect(deletionCounts(p, halfHour)).toBe(false);
    // Thu 05:30 in London is 00:30 Thursday in New York: counted.
    const nextDay = new Date('2026-11-19T05:30:00.000Z');
    expect(postponementCounts(p.due_date, later, nextDay, p.created_at, -300)).toBe(true);
    expect(categoryChangeCounts(p, nextDay)).toBe(true);
    expect(rewordingCounts(p, nextDay)).toBe(true);
    expect(deletionCounts(p, nextDay)).toBe(true);
    // The window itself is the phone's day: two days before the due day in
    // London, nothing counts, made-day or not.
    const early = { ...p, due_date: '2026-11-21T12:00:00.000Z' };
    expect(categoryChangeCounts(early, nextDay)).toBe(false);
    expect(deletionCounts(early, nextDay)).toBe(false);
  });
});

// Review round 6 (owner decision 2026-11-19, widening D69 (e)): a move to
// another category after the day it was made is remembered, and a scored
// answer given elsewhere is counted with the moved answers.
describe('a category change counted at the answer', () => {
  const open = (over: Partial<Prediction> = {}): Prediction => ({
    ...answered(),
    status: 'pending',
    resolved_at: null,
    category: 'health',
    created_at: new Date('2026-11-10T09:00:00').toISOString(),
    due_date: new Date('2026-11-14T12:00:00').toISOString(),
    ...over,
  });
  const twoDaysEarly = new Date('2026-11-12T10:00:00');
  const eve = new Date('2026-11-13T10:00:00');
  const origin = (from_category: Prediction['category'], counted_late = false) => ({
    from_category,
    counted_late,
  });

  describe('categoryChangeRemembered', () => {
    it('remembers a move after the day it was made, however early before the due day', () => {
      expect(categoryChangeRemembered(open(), twoDaysEarly)).toBe(true);
      expect(categoryChangeRemembered(open(), eve)).toBe(true);
    });

    it('remembers nothing on the day it was made, or last reworded (D62)', () => {
      expect(categoryChangeRemembered(open(), new Date('2026-11-10T20:00:00'))).toBe(false);
      const rewordedToday = open({ title_edited_at: new Date('2026-11-12T08:00:00').toISOString() });
      expect(categoryChangeRemembered(rewordedToday, twoDaysEarly)).toBe(false);
    });

    it('never for an answered one; an unreadable made time remembers it', () => {
      expect(categoryChangeRemembered(answered(), twoDaysEarly)).toBe(false);
      expect(categoryChangeRemembered(open({ created_at: 'nope' }), twoDaysEarly)).toBe(true);
    });
  });

  describe('answeredAwayFromOrigin', () => {
    const scored = (over: Partial<Prediction> = {}) =>
      answered({
        category: 'personal',
        created_at: new Date('2026-11-10T09:00:00').toISOString(),
        resolved_at: new Date('2026-11-13T19:00:00').toISOString(),
        ...over,
      });

    it('counts a scored Yes or No filed elsewhere than the remembered category', () => {
      expect(answeredAwayFromOrigin(scored(), origin('health'))).toBe(true);
      expect(answeredAwayFromOrigin(scored({ status: 'resolved_yes' }), origin('health'))).toBe(true);
    });

    it('not when answered in the remembered category, or with none remembered', () => {
      expect(answeredAwayFromOrigin(scored({ category: 'health' }), origin('health'))).toBe(false);
      expect(answeredAwayFromOrigin(scored(), null)).toBe(false);
    });

    it('never twice: not when a category change on it was counted as a late change', () => {
      expect(answeredAwayFromOrigin(scored(), origin('health', true))).toBe(false);
    });

    it('not for a same-day answer, a "Can\'t tell" or an open one: none was scored (D65)', () => {
      const sameDay = scored({ resolved_at: new Date('2026-11-10T20:00:00').toISOString() });
      expect(answeredAwayFromOrigin(sameDay, origin('health'))).toBe(false);
      expect(answeredAwayFromOrigin(scored({ status: 'skipped' }), origin('health'))).toBe(false);
      expect(
        answeredAwayFromOrigin(scored({ status: 'pending', resolved_at: null }), origin('health')),
      ).toBe(false);
    });
  });

  describe('categoryChangeCountedIfAnswered (Edit)', () => {
    it('is true for an early move with nothing remembered: the first move is remembered', () => {
      expect(categoryChangeCountedIfAnswered(open(), 'personal', null, twoDaysEarly)).toBe(true);
    });

    it('is false for no move, a move on the day it was made, or a move back where it was', () => {
      expect(categoryChangeCountedIfAnswered(open(), 'health', null, twoDaysEarly)).toBe(false);
      expect(
        categoryChangeCountedIfAnswered(open(), 'personal', null, new Date('2026-11-10T20:00:00')),
      ).toBe(false);
      // Moved health to personal earlier: moving it back to health clears it.
      const moved = open({ category: 'personal' });
      expect(categoryChangeCountedIfAnswered(moved, 'health', origin('health'), twoDaysEarly)).toBe(
        false,
      );
      // And on to a third category it is still away from health.
      expect(categoryChangeCountedIfAnswered(moved, 'work', origin('health'), twoDaysEarly)).toBe(
        true,
      );
    });

    it('is true on the day it was reworded when an earlier move is remembered', () => {
      const reworded = open({
        category: 'personal',
        title_edited_at: new Date('2026-11-12T08:00:00').toISOString(),
      });
      expect(categoryChangeCountedIfAnswered(reworded, 'work', origin('health'), twoDaysEarly)).toBe(
        true,
      );
      expect(
        categoryChangeCountedIfAnswered(reworded, 'health', origin('health'), twoDaysEarly),
      ).toBe(false);
    });

    it('is false when the move is counted now, as a late change, or one was before', () => {
      expect(categoryChangeCounts(open(), eve)).toBe(true);
      expect(categoryChangeCountedIfAnswered(open(), 'personal', null, eve)).toBe(false);
      expect(
        categoryChangeCountedIfAnswered(open({ category: 'personal' }), 'work', origin('health', true), twoDaysEarly),
      ).toBe(false);
    });

    it('is false for an answered prediction', () => {
      expect(categoryChangeCountedIfAnswered(answered(), 'personal', null, twoDaysEarly)).toBe(false);
    });
  });
});

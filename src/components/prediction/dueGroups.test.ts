import type { Prediction } from '@/types';

import {
  daysUntilDue,
  dueWithin,
  firstAnswerLead,
  groupByDue,
  isReadyToResolve,
  nextDueLine,
} from './dueGroups';

// Local noon on 10 Sep 2026; every due date below is built in local time too,
// so the tests hold in any time zone.
const NOW = new Date(2026, 8, 10, 12, 0, 0);

function dueIn(days: number, id = `d${days}`, hour = 12): Prediction {
  const due = new Date(2026, 8, 10 + days, hour, 0, 0);
  return {
    id,
    user_id: 'u1',
    title: id,
    category: 'work',
    confidence: 70,
    created_at: '2026-09-01T00:00:00.000Z',
    due_date: due.toISOString(),
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
  };
}

describe('daysUntilDue', () => {
  it('counts local calendar days, not 24-hour spans', () => {
    // Due at 08:00 tomorrow is 20 hours away but one calendar day.
    expect(daysUntilDue(dueIn(1, 'a', 8), NOW)).toBe(1);
    // Due at 23:00 today is still today.
    expect(daysUntilDue(dueIn(0, 'b', 23), NOW)).toBe(0);
    expect(daysUntilDue(dueIn(-3), NOW)).toBe(-3);
  });
});

describe('isReadyToResolve', () => {
  it('is true from the due day on, and only while pending', () => {
    expect(isReadyToResolve(dueIn(0), NOW)).toBe(true);
    expect(isReadyToResolve(dueIn(-2), NOW)).toBe(true);
    expect(isReadyToResolve(dueIn(1), NOW)).toBe(false);
    expect(isReadyToResolve({ ...dueIn(-2), status: 'resolved_yes' }, NOW)).toBe(false);
  });
});

describe('groupByDue', () => {
  it('returns nothing for no predictions', () => {
    expect(groupByDue([], NOW)).toEqual([]);
  });

  it('groups into ready, the next 7 days and later, soonest first', () => {
    const groups = groupByDue(
      [dueIn(30), dueIn(3), dueIn(-1), dueIn(0), dueIn(7), dueIn(8)],
      NOW,
    );
    expect(groups.map((g) => g.title)).toEqual(['Ready to resolve', 'Next 7 days', 'Later']);
    expect(groups.map((g) => g.data.map((p) => p.id))).toEqual([
      ['d-1', 'd0'],
      ['d3', 'd7'],
      ['d8', 'd30'],
    ]);
  });

  it('leaves out empty groups', () => {
    expect(groupByDue([dueIn(2)], NOW).map((g) => g.key)).toEqual(['week']);
  });

  it('keeps a prediction with a bad due date, under Later', () => {
    const groups = groupByDue([{ ...dueIn(2), due_date: 'not a date' }], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('later');
  });
});

// Roadmap step 32: while calibrating, the wait gets a date.
describe('nextDueLine', () => {
  // The date's spaces are no-break ones, so it never splits across lines.
  const day = (p: Prediction) =>
    new Date(p.due_date)
      .toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
      .replace(/ /g, '\u00A0');

  it('names the soonest due date when nothing is ready yet', () => {
    const soonest = dueIn(3, 'soon');
    expect(nextDueLine([dueIn(9, 'later'), soonest], NOW)).toBe(
      `The next one comes due ${day(soonest)}.`,
    );
  });

  it('calls it the first while nothing has resolved', () => {
    const soonest = dueIn(3, 'soon');
    expect(nextDueLine([soonest], NOW, { first: true })).toBe(
      `The first one comes due ${day(soonest)}.`,
    );
  });

  it('says how many are ready when some already are', () => {
    expect(nextDueLine([dueIn(0, 'a'), dueIn(5, 'b')], NOW)).toBe('One is ready to resolve now.');
    expect(nextDueLine([dueIn(0, 'a'), dueIn(-2, 'b'), dueIn(5, 'c')], NOW)).toBe(
      '2 are ready to resolve now.',
    );
  });

  it('says nothing with nothing open', () => {
    expect(nextDueLine([], NOW)).toBeNull();
  });
});

describe('dueWithin', () => {
  it('counts what can be answered within the window, overdue included', () => {
    expect(dueWithin([dueIn(-3), dueIn(0), dueIn(7), dueIn(8)], NOW, 7)).toBe(3);
    expect(dueWithin([], NOW, 7)).toBe(0);
  });
});

// Roadmap D30: before the first answer, Today leads with when it comes.
describe('firstAnswerLead', () => {
  it('says tomorrow evening for a prediction due tomorrow', () => {
    expect(firstAnswerLead([dueIn(7), dueIn(1)], NOW)).toBe('Your first answer: tomorrow evening');
  });

  it("names the day's evening within the week", () => {
    // 10 Sep 2026 is a Thursday, so three days on is Sunday.
    expect(firstAnswerLead([dueIn(3)], NOW)).toBe('Your first answer: Sunday evening');
  });

  it('gives the date beyond the week', () => {
    expect(firstAnswerLead([dueIn(9)], NOW)).toMatch(/^Your first answer: Sat,?\u00A0Sep\u00A019$|^Your first answer: Sat,\u00A019\u00A0Sep$/);
  });

  it('says it is ready once one is due', () => {
    expect(firstAnswerLead([dueIn(0), dueIn(2)], NOW)).toBe('Your first answer is ready');
  });

  it('says nothing with nothing open', () => {
    expect(firstAnswerLead([], NOW)).toBeNull();
  });
});

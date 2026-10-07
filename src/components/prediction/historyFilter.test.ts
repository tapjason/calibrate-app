import type { Prediction } from '@/types';

import {
  emptyHistoryMessage,
  filterHistory,
  firstHistoryCopy,
  parseRangeParam,
  rangeText,
} from './historyFilter';

let seq = 0;
function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Prediction ${seq}`,
    category: 'work',
    confidence: 80,
    created_at: '2026-09-01T12:00:00.000Z',
    due_date: '2026-09-08T12:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2026-09-08T18:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

// Stands in for the engine's convention, handed in through statsStore.
const rangeLow = (c: number) => (c >= 100 ? 80 : Math.floor(c / 20) * 20);

describe('parseRangeParam (roadmap step 51)', () => {
  it('accepts the five range edges', () => {
    expect([0, 20, 40, 60, 80].map((n) => parseRangeParam(String(n)))).toEqual([
      0, 20, 40, 60, 80,
    ]);
  });

  it('shows everything for a missing, stale or hand-typed value', () => {
    expect(parseRangeParam(undefined)).toBeNull();
    expect(parseRangeParam('')).toBeNull();
    expect(parseRangeParam('70')).toBeNull();
    expect(parseRangeParam('100')).toBeNull();
    expect(parseRangeParam('abc')).toBeNull();
    expect(parseRangeParam(['80'])).toBeNull();
  });
});

describe('filterHistory', () => {
  const work80 = prediction({ category: 'work', confidence: 80 });
  const work100 = prediction({ category: 'work', confidence: 100 });
  const health85 = prediction({ category: 'health', confidence: 85 });
  const work60 = prediction({ category: 'work', confidence: 60 });
  const all = [work80, work100, health85, work60];

  it('keeps everything with no filter', () => {
    expect(filterHistory(all, { category: 'all', range: null }, rangeLow)).toEqual(all);
  });

  it('filters by range, by the same edges as the chart', () => {
    expect(filterHistory(all, { category: 'all', range: 80 }, rangeLow)).toEqual([
      work80,
      work100,
      health85,
    ]);
    expect(filterHistory(all, { category: 'all', range: 60 }, rangeLow)).toEqual([work60]);
  });

  it('combines a range with a category', () => {
    expect(filterHistory(all, { category: 'work', range: 80 }, rangeLow)).toEqual([
      work80,
      work100,
    ]);
  });
});

describe('emptyHistoryMessage', () => {
  it('says what is missing, in words', () => {
    expect(emptyHistoryMessage({ category: 'all', range: null })).toBe(
      'Resolved predictions collect here, with how each one turned out.',
    );
    expect(emptyHistoryMessage({ category: 'finance', range: null })).toBe(
      'Nothing resolved in finance yet.',
    );
    expect(emptyHistoryMessage({ category: 'all', range: 0 })).toBe(
      'Nothing resolved at 0–20% yet.',
    );
    expect(emptyHistoryMessage({ category: 'social', range: 80 })).toBe(
      'Nothing resolved in social at 80–100% yet.',
    );
  });

  it('writes a range the way the chart does', () => {
    expect(rangeText(40)).toBe('40–60%');
  });
});

// Roadmap step 69: before anything resolves, History says when it will and
// offers a way forward.
describe('firstHistoryCopy', () => {
  const now = new Date('2026-09-10T15:00:00.000Z');
  const open = (due: string, id: string) =>
    prediction({ id, status: 'pending', resolved_at: null, due_date: `${due}T12:00:00.000Z` });

  it('offers a first prediction when nothing is open', () => {
    expect(firstHistoryCopy([], now)).toEqual({
      message: 'Resolved predictions collect here, with how each one turned out.',
      action: { kind: 'log', label: 'Log a prediction' },
    });
  });

  it('dates the first answer, and offers another prediction meanwhile', () => {
    const copy = firstHistoryCopy([open('2026-09-15', 'a')], now);
    expect(copy.message).toMatch(
      /^Resolved predictions collect here, with how each one turned out\. The first one comes due /,
    );
    expect(copy.action).toEqual({ kind: 'log', label: 'Log a prediction' });
  });

  it('opens the one that is ready, or all of them from as many as Home runs', () => {
    expect(firstHistoryCopy([open('2026-09-09', 'a'), open('2026-09-20', 'b')], now)).toEqual({
      message:
        'Resolved predictions collect here, with how each one turned out. One is ready to resolve now.',
      action: { kind: 'resolve', label: 'Resolve it now', id: 'a' },
    });
    // Two ready: Home shows two cards and no run, so History opens the soonest.
    expect(
      firstHistoryCopy([open('2026-09-09', 'a'), open('2026-09-08', 'b')], now).action,
    ).toEqual({ kind: 'resolve', label: 'Resolve the first one', id: 'b' });
    expect(
      firstHistoryCopy(
        [open('2026-09-09', 'a'), open('2026-09-08', 'b'), open('2026-09-07', 'c')],
        now,
      ).action,
    ).toEqual({ kind: 'run', label: 'Resolve all 3' });
  });
});

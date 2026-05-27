import type { Prediction } from '@/types';

import { computeStreak } from './streak';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: 'u1',
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-01-01T00:00:00.000Z',
  status: 'resolved_yes',
  resolved_at: '2026-01-01T12:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

describe('computeStreak', () => {
  it('returns 0 for empty input', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('returns 0 when no predictions have resolved_at', () => {
    expect(
      computeStreak([p({ status: 'pending', resolved_at: null })]),
    ).toBe(0);
  });

  it('returns 1 for a single resolved day', () => {
    expect(computeStreak([p({ resolved_at: '2026-05-19T10:00:00.000Z' })])).toBe(1);
  });

  it('counts consecutive days', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'b', resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    expect(computeStreak(preds)).toBe(3);
  });

  it('collapses multiple resolutions on the same day to one', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-19T03:00:00.000Z' }),
      p({ id: 'b', resolved_at: '2026-05-19T15:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-19T22:00:00.000Z' }),
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('breaks the streak on a gap', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-15T08:00:00.000Z' }),
      // gap: 5/16 missing
      p({ id: 'b', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'd', resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    // streak from 5/19 → 5/18 → 5/17, then gap, so 3
    expect(computeStreak(preds)).toBe(3);
  });

  it('is unaffected by ordering of input', () => {
    const a = p({ id: 'a', resolved_at: '2026-05-17T08:00:00.000Z' });
    const b = p({ id: 'b', resolved_at: '2026-05-18T08:00:00.000Z' });
    const c = p({ id: 'c', resolved_at: '2026-05-19T08:00:00.000Z' });
    expect(computeStreak([c, a, b])).toBe(3);
  });

  it('ignores skipped resolutions even when resolved_at is set', () => {
    const preds = [
      p({ id: 'a', status: 'resolved_yes', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'b', status: 'skipped',      resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'c', status: 'resolved_no',  resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    // 5/18 is a skip → gap. Streak from 5/19 alone is 1.
    expect(computeStreak(preds)).toBe(1);
  });
});

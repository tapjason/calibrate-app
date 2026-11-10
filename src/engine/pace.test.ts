import type { Prediction } from '@/types';

import { PACE_MIN_ANSWERS, PACE_MIN_DAYS, PACE_WINDOW_DAYS, unlockEstimate } from './pace';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const answer = (d: number, i: number): Prediction => ({
  id: `p${d}-${i}`,
  user_id: 'u',
  title: 't',
  category: 'work',
  confidence: 70,
  created_at: daysAgo(d + 2),
  due_date: daysAgo(d),
  status: 'resolved_yes',
  resolved_at: daysAgo(d),
  reflection: null,
  integrity_bonus: false,
});

// Roadmap D53 (blind playtest 2026-11-09b, finding 2).
describe('unlockEstimate', () => {
  it('reads the pace over the recent window', () => {
    // 7 answers in the last 28 days: one every 4 days; 13 to go is 52 days.
    const scored = Array.from({ length: 7 }, (_, i) => answer(i * 4 + 1, i));
    const got = unlockEstimate(scored, 20, NOW, daysAgo(100));
    expect(PACE_WINDOW_DAYS).toBe(28);
    expect(got?.remaining).toBe(13);
    expect(got?.days).toBe(52);
    expect(got?.at.toISOString()).toBe(new Date(NOW.getTime() + 52 * 86_400_000).toISOString());
  });

  it("reads a new person's pace over the days they've had, a week at least", () => {
    const scored = [answer(1, 0), answer(2, 1), answer(2, 2)];
    // Started 3 days ago: read over PACE_MIN_DAYS, 3 in 7 days; 17 to go is 40 days.
    expect(PACE_MIN_DAYS).toBe(7);
    expect(unlockEstimate(scored, 20, NOW, daysAgo(3))?.days).toBe(40);
    // Started 14 days ago: 3 in 14; 17 to go is 80 days.
    expect(unlockEstimate(scored, 20, NOW, daysAgo(14))?.days).toBe(80);
  });

  it('waits for a few answers before guessing a pace', () => {
    expect(PACE_MIN_ANSWERS).toBe(3);
    expect(unlockEstimate([answer(1, 0), answer(2, 1)], 20, NOW, daysAgo(10))).toBeNull();
  });

  it('guesses nothing with no recent answer, or nothing left', () => {
    expect(unlockEstimate([answer(40, 0)], 20, NOW, daysAgo(60))).toBeNull();
    expect(unlockEstimate([], 20, NOW, null)).toBeNull();
    const twenty = Array.from({ length: 20 }, (_, i) => answer(1, i));
    expect(unlockEstimate(twenty, 20, NOW, daysAgo(30))).toBeNull();
  });
});

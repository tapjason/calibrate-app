import type { Prediction, PredictionStatus } from '@/types';

import {
  LOW_END_MAX,
  NUDGE_CONFIDENCE,
  NUDGE_COOLDOWN_DAYS,
  NUDGE_MIN_LOGGED,
  NUDGE_WINDOW,
  coverageGap,
  evaluateCoverageNudge,
} from './coverageNudge';

let seq = 0;

function p(
  confidence: number,
  createdAt: string,
  status: PredictionStatus = 'pending',
): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: 'x',
    category: 'work',
    confidence,
    created_at: createdAt,
    due_date: createdAt,
    status,
    resolved_at: status === 'pending' ? null : createdAt,
    reflection: null,
    integrity_bonus: confidence >= 35 && confidence <= 65,
  };
}

/** `n` logs at one confidence, newest first at day 200 counting down. */
function logs(n: number, confidence: number, dayOffset = 0): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    p(confidence, day(200 - dayOffset - i)),
  );
}

/** An ISO timestamp `d` days into 2026-01, zero-padded. */
function day(d: number): string {
  return new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString();
}

const NOW = day(300);

describe('coverageGap', () => {
  it('reports an empty low end when every log sits high', () => {
    expect(coverageGap(logs(10, 85))).toEqual({
      logged: 10,
      buckets_used: 1,
      low_end_empty: true,
    });
  });

  it('counts a single low log as covering the low end', () => {
    const gap = coverageGap([...logs(9, 85), p(15, day(199))]);
    expect(gap.low_end_empty).toBe(false);
    expect(gap.buckets_used).toBe(2);
  });

  it(`treats confidence just under ${LOW_END_MAX} as the low end and the boundary as not`, () => {
    expect(coverageGap([p(LOW_END_MAX - 1, day(1))]).low_end_empty).toBe(false);
    expect(coverageGap([p(LOW_END_MAX, day(1))]).low_end_empty).toBe(true);
  });

  it('counts pending predictions — the habit is the logging, not the outcome', () => {
    const gap = coverageGap([p(20, day(1), 'pending')]);
    expect(gap.logged).toBe(1);
    expect(gap.low_end_empty).toBe(false);
  });

  it(`looks only at the most recent ${NUDGE_WINDOW} logs`, () => {
    // One old low log, then a full window of high ones on top of it.
    const old = p(10, day(1));
    const recent = logs(NUDGE_WINDOW, 90);
    const gap = coverageGap([old, ...recent]);
    expect(gap.logged).toBe(NUDGE_WINDOW);
    expect(gap.low_end_empty).toBe(true);
  });

  it('is empty for a user with no predictions', () => {
    expect(coverageGap([])).toEqual({
      logged: 0,
      buckets_used: 0,
      low_end_empty: true,
    });
  });
});

describe('evaluateCoverageNudge', () => {
  it('nudges a user clustered high with enough history and no prior nudge', () => {
    const decision = evaluateCoverageNudge(
      coverageGap(logs(NUDGE_MIN_LOGGED, 85)),
      null,
      NOW,
    );
    expect(decision.show).toBe(true);
    expect(decision.suggested_confidence).toBe(NUDGE_CONFIDENCE);
    expect(decision.buckets_used).toBe(1);
  });

  it('stays quiet below the minimum history — a new account is not a habit', () => {
    const gap = coverageGap(logs(NUDGE_MIN_LOGGED - 1, 85));
    expect(evaluateCoverageNudge(gap, null, NOW).show).toBe(false);
  });

  it('stays quiet once the user has logged something unlikely', () => {
    const gap = coverageGap([...logs(NUDGE_MIN_LOGGED, 85), p(25, day(199))]);
    expect(evaluateCoverageNudge(gap, null, NOW).show).toBe(false);
  });

  it('stays quiet inside the cooldown', () => {
    const gap = coverageGap(logs(NUDGE_MIN_LOGGED, 85));
    const yesterday = new Date(
      Date.parse(NOW) - 1 * 86_400_000,
    ).toISOString();
    expect(evaluateCoverageNudge(gap, yesterday, NOW).show).toBe(false);
  });

  it('nudges again once the cooldown has elapsed', () => {
    const gap = coverageGap(logs(NUDGE_MIN_LOGGED, 85));
    const stale = new Date(
      Date.parse(NOW) - (NUDGE_COOLDOWN_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(evaluateCoverageNudge(gap, stale, NOW).show).toBe(true);
  });

  it('treats an unparseable last-shown timestamp as never shown', () => {
    const gap = coverageGap(logs(NUDGE_MIN_LOGGED, 85));
    expect(evaluateCoverageNudge(gap, 'not-a-date', NOW).show).toBe(true);
  });

  it('is not silenced by a last-shown timestamp in the future', () => {
    const gap = coverageGap(logs(NUDGE_MIN_LOGGED, 85));
    const future = new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString();
    expect(evaluateCoverageNudge(gap, future, NOW).show).toBe(true);
  });
});

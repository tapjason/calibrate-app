import { scoreWarmup } from '@/engine/warmup';
import type { WarmupAnswer } from '@/types';

import { warmupVerdict } from './verdictCopy';

/** Confident and wrong half the time — the overconfident case. */
const OVERCONFIDENT: WarmupAnswer[] = [
  { confidence: 90, correct: true },
  { confidence: 90, correct: false },
];

describe('warmupVerdict', () => {
  it('returns null with nothing answered rather than a verdict on no data', () => {
    expect(warmupVerdict(null)).toBeNull();
    expect(warmupVerdict(scoreWarmup([]))).toBeNull();
  });

  it('states confidence against reality, per the CLAUDE.md headline shape', () => {
    const v = warmupVerdict(scoreWarmup(OVERCONFIDENT));
    expect(v?.title).toBe('You run overconfident');
    expect(v?.detail).toBe(
      'You were 90% confident on average, and right 50% of the time.',
    );
  });

  it('reads the other direction when confidence trails accuracy', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 55, correct: true },
        { confidence: 55, correct: true },
      ]),
    );
    expect(v?.title).toBe('You run underconfident');
  });

  it('calls a matched run calibrated', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 100, correct: true },
        { confidence: 100, correct: true },
      ]),
    );
    expect(v?.title).toBe('You run well calibrated');
  });

  it('rounds the reported figures for display', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 85, correct: true },
        { confidence: 90, correct: true },
        { confidence: 80, correct: false },
      ]),
    );
    // mean 85%, 2 of 3 right = 66.67% → rounded for the headline.
    expect(v?.detail).toBe(
      'You were 85% confident on average, and right 67% of the time.',
    );
  });
});

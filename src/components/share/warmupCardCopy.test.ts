import type { WarmupResult } from '@/types';

import { warmupCardCopy } from './warmupCardCopy';

const result = (over: Partial<WarmupResult> = {}): WarmupResult => ({
  answered: 10,
  mean_confidence: 76.6,
  accuracy: 0.5,
  mini_score: 70,
  direction: 'overconfident',
  buckets: [],
  ...over,
});

describe('warmupCardCopy', () => {
  it('has nothing to say without answers', () => {
    expect(warmupCardCopy(null)).toBeNull();
    expect(warmupCardCopy(result({ answered: 0 }))).toBeNull();
  });

  it('turns the verdict into a first-person receipt', () => {
    expect(warmupCardCopy(result())).toEqual({
      eyebrow: 'My calibration warm-up',
      headline: 'I run hot',
      receipt: '77% sure, 50% right',
      context: '10 questions. Real predictions next.',
    });
  });

  it('names each direction', () => {
    expect(warmupCardCopy(result({ direction: 'underconfident' }))?.headline).toBe(
      'I run cool',
    );
    expect(warmupCardCopy(result({ direction: 'calibrated' }))?.headline).toBe(
      'I run true',
    );
  });

  // CLAUDE.md: Warmup results never pass for the real rating.
  it('always says it is a warm-up', () => {
    expect(warmupCardCopy(result())?.eyebrow).toMatch(/warm-up/);
  });
});

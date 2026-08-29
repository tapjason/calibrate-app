// Presentation helper: turn a scored Warmup into the words on the result
// screen. Pure and testable, in the same spirit as stats/ratingHeadline.ts —
// the copy rules live in one place rather than inline in JSX.
//
// The headline is the Day-0 aha, and CLAUDE.md gives its exact shape:
// "You were 85% confident but right 55% of the time — you run overconfident."

import type { WarmupResult } from '@/types';

export interface WarmupVerdict {
  /** Short identity line, e.g. "You run overconfident". */
  title: string;
  /** The receipts: stated confidence vs. what actually happened. */
  detail: string;
  /** One line on what to do with that. */
  advice: string;
}

const TITLES = {
  overconfident: 'You run overconfident',
  underconfident: 'You run underconfident',
  calibrated: 'You run well calibrated',
} as const;

const ADVICE = {
  overconfident:
    'When you feel sure, you are less sure than you think. Try shading your confidence down.',
  underconfident:
    'You know more than you give yourself credit for. Try trusting your gut a little further.',
  calibrated:
    'Your confidence tracks reality closely. The real test is whether it holds on your own predictions.',
} as const;

/**
 * `null` when nothing was answered — the caller should render the quiz, not a
 * verdict built on zero data.
 */
export function warmupVerdict(result: WarmupResult | null): WarmupVerdict | null {
  if (!result || result.answered === 0) return null;

  const stated = Math.round(result.mean_confidence);
  const actual = Math.round(result.accuracy * 100);

  return {
    title: TITLES[result.direction],
    detail: `You were ${stated}% confident on average, and right ${actual}% of the time.`,
    advice: ADVICE[result.direction],
  };
}

// Presentation helper for the Day-0 share card: the Warmup verdict in the
// first person, shaped for a chat thread. Pure and testable.
//
// DESIGN_SYSTEM §7.5 / rule 0.10: Share is never empty. Before any real
// prediction resolves, the Warmup result *is* the card — "I run hot: 77%
// sure, 50% right". It is labelled a warm-up so it can't pass for a real
// calibration rating (CLAUDE.md: Warmup results never mix with real stats).

import type { WarmupResult } from '@/types';

export interface WarmupCardCopy {
  eyebrow: string;
  headline: string;
  receipt: string;
  context: string;
}

const HEADLINES = {
  overconfident: 'I run hot',
  underconfident: 'I run cool',
  calibrated: 'I run true',
} as const;

/** Null when there is nothing honest to show — no answers, no card. */
export function warmupCardCopy(result: WarmupResult | null): WarmupCardCopy | null {
  if (!result || result.answered === 0) return null;
  const stated = Math.round(result.mean_confidence);
  const right = Math.round(result.accuracy * 100);
  const n = result.answered;
  return {
    eyebrow: 'My calibration warm-up',
    headline: HEADLINES[result.direction],
    receipt: `${stated}% sure, ${right}% right`,
    // "Tricky", not "quick": the bank is picked to be hard, and the verdict
    // says so too (roadmap D14), so the card doesn't pass for a general test.
    context: `${n} tricky ${n === 1 ? 'question' : 'questions'}. Real predictions next.`,
  };
}

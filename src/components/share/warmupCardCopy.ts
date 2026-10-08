// Presentation helper for the Day-0 share card: the Warmup's counts shaped as an invitation for a chat thread. Pure and testable.
//
// DESIGN_SYSTEM §7.5 / rule 0.10: Share is never empty. Before any real
// prediction resolves, the Warmup result *is* the card — "5 of 10 right.
// I was 77% sure. How sure are you?". It is labelled a warm-up so it can't pass
// for a real calibration rating (CLAUDE.md: Warmup results never mix with real stats).

import type { WarmupResult } from '@/types';

export interface WarmupCardCopy {
  eyebrow: string;
  headline: string;
  receipt: string;
  context: string;
}

/** Null when there is nothing honest to show — no answers, no card. */
export function warmupCardCopy(result: WarmupResult | null): WarmupCardCopy | null {
  if (!result || result.answered === 0) return null;
  const stated = Math.round(result.mean_confidence);
  const n = result.answered;
  const right = Math.round(result.accuracy * n);
  return {
    eyebrow: 'My calibration warm-up',
    // The counts as an invitation, not a personality (roadmap D18 (5)).
    headline: `${right} of ${n} right`,
    receipt: `I was ${stated}% sure. How sure are you?`,
    context: `${n} ${n === 1 ? 'question' : 'questions'}. Real predictions next.`,
  };
}

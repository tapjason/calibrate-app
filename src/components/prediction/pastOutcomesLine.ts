// Presentation helper: a prediction's own record, under the Log screen's title
// field (roadmap D32, step 135). "Answered 3 times before: happened 1 of 3."
//
// Counts of outcomes, never the earlier confidences, which would anchor the
// new number; the engine doesn't hand them over (PastOutcomes). "Answered"
// rather than "Logged": a skipped or still-open one with the same title was
// logged too, and neither is counted. Free: Log is the core loop.

import type { PastOutcomes } from '@/types';

/** No-break space: "1 of 3" and "3 times" never split across lines (DESIGN_SYSTEM §7.9). */
const NBSP = '\u00A0';

export function pastOutcomesLine(past: PastOutcomes | null): string | null {
  if (past === null || past.answered < 1) return null;
  const { answered, happened } = past;
  if (answered === 1) {
    return happened === 1
      ? 'Answered once before: it happened.'
      : "Answered once before: it didn't happen.";
  }
  const times = answered === 2 ? 'twice' : `${answered}${NBSP}times`;
  return `Answered ${times} before: happened ${happened}${NBSP}of${NBSP}${answered}.`;
}

// The Brier score's one quiet line on Insights (roadmap D24, DESIGN_SYSTEM
// §7.1). Pure, so a test holds the words to the number.

import { localCount } from '@/components/ui/count';
import type { BrierEdge } from '@/store/statsStore';

/**
 * "Brier score 0.22, lower is better. Saying 64% every time, how often your
 * calls came true, would score 0.23." Since roadmap D35 the yardstick is the
 * person's own base rate, not always saying 50% (0.25), which flattered anyone
 * whose calls mostly happen. No-break spaces keep each number with its words:
 * at 375pt "0.25" wrapped alone.
 */
export function brierLine(
  brier: number,
  baseline: { rate: number; score: number },
  /**
   * Whether the gap is more than luck (step 173, `brierEdge`), and the scored
   * count it rests on, the "N scored" beside it. Without them, the plain
   * comparison.
   */
  edge?: { edge: BrierEdge; scored: number } | null,
): string {
  const rate = Math.round(baseline.rate * 100);
  const lead =
    `Brier score ${brier.toFixed(2)}, lower is better. ` +
    `Saying ${rate}% every time, how often your calls came true, would score`;
  const base = baseline.score.toFixed(2);
  if (!edge) return `${lead} ${base}.`;
  // A small gap on a short record reads as a verdict it can't carry: on
  // unlock day 0.22 against 0.23 read as "a parrot beats me" (blind playtest
  // 2026-11-12f, finding 5). "Could be", since inside the middle 80% doesn't
  // prove luck (record audit 2026-11-12).
  if (edge.edge === 'about_same') {
    return `${lead} about the same, ${base}; with ${localCount(edge.scored)} answers a gap this small could be luck.`;
  }
  return edge.edge === 'better'
    ? `${lead} ${base}, so your numbers said more than your base rate.`
    : `${lead} ${base}, so your numbers said less than your base rate would have.`;
}

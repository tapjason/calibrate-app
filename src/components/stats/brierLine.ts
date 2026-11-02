// The Brier score's one quiet line on Insights (roadmap D24, DESIGN_SYSTEM
// §7.1). Pure, so a test holds the words to the number.

/**
 * "Brier score 0.22, lower is better. Saying 64% every time, how often your
 * calls came true, would score 0.23." Since roadmap D35 the yardstick is the
 * person's own base rate, not always saying 50% (0.25), which flattered anyone
 * whose calls mostly happen. No-break spaces keep each number with its words:
 * at 375pt "0.25" wrapped alone.
 */
export function brierLine(brier: number, baseline: { rate: number; score: number }): string {
  const rate = Math.round(baseline.rate * 100);
  return (
    `Brier score\u00A0${brier.toFixed(2)}, lower is better. ` +
    `Saying ${rate}%\u00A0every time, how often your calls came true, would score\u00A0${baseline.score.toFixed(2)}.`
  );
}

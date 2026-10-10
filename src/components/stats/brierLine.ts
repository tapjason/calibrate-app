// The Brier score's one quiet line on Insights (roadmap D24, DESIGN_SYSTEM
// §7.1). Pure, so a test holds the words to the number.

/**
 * "Brier score 0.14 · lower is better; always saying 50% scores 0.25". No-break
 * spaces keep each number with its words: at 375pt "0.25" wrapped alone.
 */
export function brierLine(brier: number): string {
  return `Brier score\u00A0${brier.toFixed(2)} · lower is better; always saying 50%\u00A0scores\u00A00.25`;
}

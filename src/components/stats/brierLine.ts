// The Brier score's one quiet line on Insights (roadmap D24, DESIGN_SYSTEM
// §7.1). Pure, so a test holds the words to the number.

/** "Brier score 0.14 · lower is better; always saying 50% scores 0.25" */
export function brierLine(brier: number): string {
  return `Brier score ${brier.toFixed(2)} · lower is better; always saying 50% scores 0.25`;
}

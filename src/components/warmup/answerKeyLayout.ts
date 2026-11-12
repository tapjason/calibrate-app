/**
 * When an answer-key row stacks its tick and percent on a line above the
 * text. Side by side, at double text size the text kept a third or a quarter
 * of the row, one word a line (blind playtest 2026-11-12e, finding 12).
 */

/** From this text size the row always stacks (iOS's largest non-accessibility size is about 1.35). */
export const ANSWER_KEY_STACK_SCALE = 1.3;
/** Below this width for the text, a row stacks at any enlarged size. */
export const ANSWER_KEY_MIN_TEXT = 220;
/** The tick's size and the gap either side of the text. */
export const ANSWER_KEY_ICON = 18;
export const ANSWER_KEY_GAP = 10;
/** "100%" in footnote type at the default size, a little over. */
const PERCENT_WIDTH = 36;

/**
 * Whether the row stacks. Never at the default text size, whatever the width,
 * so the layout at normal sizes is as it was; from ANSWER_KEY_STACK_SCALE
 * always; in between, when the text would be narrower than
 * ANSWER_KEY_MIN_TEXT. `rowWidth` is 0 until the row has been laid out.
 */
export function answerKeyStacks(rowWidth: number, fontScale: number): boolean {
  if (fontScale >= ANSWER_KEY_STACK_SCALE) return true;
  if (fontScale <= 1 || rowWidth <= 0) return false;
  const sides = ANSWER_KEY_ICON + 2 * ANSWER_KEY_GAP + PERCENT_WIDTH * fontScale;
  return rowWidth - sides < ANSWER_KEY_MIN_TEXT;
}

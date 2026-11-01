// Line-breaking help for range labels (roadmap step 70). An en dash is a
// break opportunity, so at 320pt "You're overconfident at 80–100%" ended a
// line on "80–" and began the next with "100%". A word joiner (U+2060) either
// side of the dash keeps the range whole; it has no width and VoiceOver
// doesn't read it. Applied where text is drawn, so the copy helpers and their
// tests keep the plain string.

const JOIN = '\u2060';
const NBSP = '\u00A0';

/** "80–100%" with the dash held to both numbers. */
export function holdRanges(text: string): string {
  return text.replace(/(\d)–(?=\d)/g, `$1${JOIN}–${JOIN}`);
}

/**
 * "3 more resolved to reach Tracker" with its target held together, so at
 * 320pt the line breaks before "to" and never strands "Tracker" alone
 * (roadmap D33, when "→ Tracker" became "to reach Tracker").
 */
export function holdTarget(text: string): string {
  return text.replace(/ to reach (\S+)$/, ` to${NBSP}reach${NBSP}$1`);
}

// Ending a sentence after text the phone's locale formatted (a date, a time).

/**
 * `text` ending in a full stop, without a second one: a Spanish date or time
 * can end in an abbreviation's own ("14 nov.", "7:00 p. m."), and adding ours
 * printed "nov.." and "p. m.." (blind playtest 2026-11-13e, run 7).
 */
export function endSentence(text: string): string {
  const t = text.trimEnd();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

// Built from code points: the editing tools here turn a written escape into
// the character itself (docs/tooling-notes.md).
const range = (from: number, to: number) =>
  `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
const HEBREW = new RegExp(`[${range(0x0590, 0x05ff)}]`, 'g');
const ARABIC = new RegExp(`[${range(0x0600, 0x06ff)}${range(0x0750, 0x077f)}]`, 'g');
const LETTER = /[A-Za-z]/g;

/**
 * The language VoiceOver should read a person's own text in, when it is
 * written mostly in Hebrew or Arabic script, or undefined to keep the app's.
 * Arabic and Hebrew titles were read letter by letter in the English voice
 * (playtest 2026-11-08, finding 41). Only these two scripts: Latin text can't
 * be told apart by script, and the phone's own voice reads it.
 */
export function textLanguage(text: string): 'he' | 'ar' | undefined {
  const hebrew = text.match(HEBREW)?.length ?? 0;
  const arabic = text.match(ARABIC)?.length ?? 0;
  const latin = text.match(LETTER)?.length ?? 0;
  if (hebrew > latin && hebrew >= arabic && hebrew > 0) return 'he';
  if (arabic > latin && arabic > 0) return 'ar';
  return undefined;
}

/** A person's note cut to `max` characters for a spoken label, with an ellipsis. */
export function spokenExcerpt(text: string, max = 140): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Characters as a person sees them: a family emoji, a flag or an accented
 * letter is one, however many UTF-16 units it takes. The text limits count
 * these, and a cut never falls inside one (playtest 2026-11-08b, finding 6:
 * "Friends and famil" plus a family emoji was saved as half a family while
 * the counter said "23 of 24").
 */

interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity: 'grapheme' },
) => GraphemeSegmenter;

const ZWJ = 0x200d;

/** Combining marks, where the engine knows the property; null where not. */
const MARK: RegExp | null = (() => {
  try {
    return new RegExp('^\\p{M}$', 'u');
  } catch {
    return null;
  }
})();

/** Joins the code point before it: marks, selectors, skin tones, tags, keycaps. */
function extends_(cp: number, ch: string): boolean {
  return (
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // skin tones
    (cp >= 0xe0020 && cp <= 0xe007f) || // tag sequences (subdivision flags)
    cp === 0x20e3 || // keycap
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics, without \p{M}
    (MARK !== null && MARK.test(ch))
  );
}

const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/**
 * Without Intl.Segmenter: code points, joined across ZWJ, modifiers,
 * selectors, marks and regional-indicator pairs. Not the whole Unicode rule
 * set, enough for emoji and accents. Exported for tests.
 */
export function splitGraphemesFallback(text: string): string[] {
  const out: string[] = [];
  let joinNext = false;
  for (const ch of Array.from(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    const last = out.length - 1;
    if (last >= 0 && (joinNext || cp === ZWJ || extends_(cp, ch))) {
      out[last] += ch;
      joinNext = cp === ZWJ;
      continue;
    }
    if (last >= 0 && isRegional(cp)) {
      const prev = Array.from(out[last]);
      if (prev.length === 1 && isRegional(prev[0].codePointAt(0) ?? 0)) {
        out[last] += ch;
        continue;
      }
    }
    out.push(ch);
    joinNext = false;
  }
  return out;
}

/** The text's characters as a person sees them. */
export function splitGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  return splitGraphemesFallback(text);
}

/** How many characters a person sees. */
export function graphemeLength(text: string): number {
  // Every character is at least one unit, so short ASCII needs no split.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(text)) return text.length;
  return splitGraphemes(text).length;
}

/** The text cut to `max` characters, never inside one. */
export function fitGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(text)) return text.slice(0, max);
  const parts = splitGraphemes(text);
  return parts.length <= max ? text : parts.slice(0, max).join('');
}

/**
 * An edit held to `max` characters by trimming only what the edit added:
 * typing or pasting into the middle of a full field used to keep the new
 * words and drop the field's last ones, without a word (review,
 * 2026-11-08). Below the limit the edit passes through unchanged. Where the
 * edit can't be told apart (it replaced everything), the end is cut.
 */
export function fitEdit(previous: string, next: string, max: number): string {
  if (graphemeLength(next) <= max) return next;
  // Already over (nothing should leave it so): a deletion still goes through.
  if (graphemeLength(next) <= graphemeLength(previous)) return next;
  const parts = splitGraphemes(next);
  // Boundaries of `next` in UTF-16 units, so a cut never splits a character.
  const bounds = [0];
  for (const g of parts) bounds.push(bounds[bounds.length - 1] + g.length);
  let start = 0;
  const limit = Math.min(previous.length, next.length);
  while (start < limit && previous[start] === next[start]) start++;
  let end = 0;
  while (
    end < limit - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  // Snap to whole characters: the kept start ends on a boundary, the kept end
  // begins on one.
  const from = Math.max(...bounds.filter((b) => b <= start));
  const to = Math.min(...bounds.filter((b) => b >= next.length - end));
  const head = next.slice(0, from);
  const tail = next.slice(to);
  const room = max - graphemeLength(head + tail);
  if (room < 0) return fitGraphemes(next, max);
  return head + fitGraphemes(next.slice(from, to), room) + tail;
}

/**
 * The input's own limit in UTF-16 units, a backstop against a huge paste:
 * room for every character to be a long emoji, so the cut that counts is
 * `fitGraphemes`, by character.
 */
export function unitBackstop(max: number): number {
  return max * 12;
}

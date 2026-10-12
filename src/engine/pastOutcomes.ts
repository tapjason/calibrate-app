// A prediction's own record (roadmap D32, built as step 135): when the title
// typed on Log matches predictions already answered, how they came out.
//
// Buehler, Griffin & Ross (1994, Study 4) removed the optimistic bias in
// people's predictions about their own tasks by having them connect past
// experiences to the prediction; left alone, people plan from the future and
// explain their past misses as one-offs (research/debiasing-2026-10.md §1).
// The closest past experience is the same prediction, which people log again
// and again ("Swim twice this week").
//
// Outcomes only. The earlier confidences stay out, here and in the type,
// because the old number would anchor the new one (the reason "Log it again"
// starts the control empty). Skips count for nothing, as everywhere else.

import type { PastOutcomes, Prediction } from '@/types';

/**
 * Curly apostrophes and quotes. iOS's Smart Punctuation turns a typed ' into
 * ’, while a starter idea, a synced title typed on the web and "Log it again"
 * carry whatever was saved, so "I’ll" and "I'll" have to be one word.
 */
const SINGLE_QUOTES = /[\u2018\u2019\u201B\u02BC]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201F]/g;
/**
 * What a sentence ends on, with any spaces among it: "this week.", "this
 * week!?", "this week …". Only at the end, so "8,000 steps" and "8000 steps"
 * stay different words.
 */
const END_PUNCTUATION = /[\s.!?\u2026,;:\u3002\uFF01\uFF1F]+$/;
const SPACES = /\s+/g;

/**
 * The title as D32 compares it: the same words once case, spaces and end
 * punctuation are ignored, and curly quotes read as straight ones. Empty for
 * a title with no words in it.
 */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(END_PUNCTUATION, '')
    .replace(SPACES, ' ')
    .trim();
}

/**
 * How the answered predictions titled like `title` came out, or null until
 * one has been answered yes or no. From the first one on: it's the person's
 * own record, not a score, so no minimum applies. A repeated prediction
 * ("Log it again") always matches the one it repeats.
 */
export function pastOutcomes(
  resolved: readonly Prediction[],
  title: string,
): PastOutcomes | null {
  const key = titleKey(title);
  if (key.length === 0) return null;
  let answered = 0;
  let happened = 0;
  for (const p of resolved) {
    if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') continue;
    if (titleKey(p.title) !== key) continue;
    answered += 1;
    if (p.status === 'resolved_yes') happened += 1;
  }
  return answered === 0 ? null : { answered, happened };
}

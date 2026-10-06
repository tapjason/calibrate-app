// Presentation helper: turn a scored Warmup into the words on the result
// screen. Pure and testable, in the same spirit as stats/ratingHeadline.ts —
// the copy rules live in one place rather than inline in JSX.
//
// The headline is the Day-0 aha, and CLAUDE.md gives its exact shape:
// "You were 85% confident but right 55% of the time — you run overconfident."

import type { WarmupAnswer, WarmupResult } from '@/types';

export interface WarmupVerdict {
  /** Short identity line, e.g. "You run overconfident". */
  title: string;
  /** The receipts: stated confidence vs. what actually happened. */
  detail: string;
  /** One line on what to do with that. */
  advice: string;
  /**
   * Said only when every answer carried the same number (roadmap step 49):
   * the slider starts at 75%, so tapping straight through reads as "75% on
   * everything", and the verdict should say that plainly. Null otherwise.
   */
  sameNumber: string | null;
  /**
   * Under an overconfident verdict only (roadmap D14): the questions are
   * picked to be tricky, and selected questions are how overconfidence is
   * produced in the research (.73 confidence for .64 correct, against .73 for
   * .72 when questions are sampled at random). So the verdict says so.
   */
  trickyNote: string | null;
}

const TITLES = {
  overconfident: 'You run overconfident',
  underconfident: 'You run underconfident',
  calibrated: 'You run well calibrated',
} as const;

const ADVICE = {
  overconfident:
    "When you feel sure, you're right less often than you think. Try shading your confidence down.",
  underconfident:
    'You know more than you give yourself credit for. Try trusting your gut a little further.',
  calibrated:
    'Your confidence tracks reality closely. The real test is whether it holds on your own predictions.',
} as const;

const TRICKY_NOTE =
  'These were picked to be tricky, so most people run hot here. ' +
  'Your own predictions are the real test.';

const SAME_NUMBER_NOTE =
  'One number for every question, the ones you knew and the ones you guessed. ' +
  'Telling those apart is part of the skill too.';

/** Below this many answers, "the same number on all of them" says nothing. */
const MIN_ANSWERS_FOR_SAME_NUMBER = 3;

/** The one confidence every answer shares, or null when they differ. */
function sharedConfidence(answers: readonly WarmupAnswer[]): number | null {
  if (answers.length < MIN_ANSWERS_FOR_SAME_NUMBER) return null;
  const first = answers[0].confidence;
  return answers.every((a) => a.confidence === first) ? first : null;
}

/**
 * `null` when nothing was answered — the caller should render the quiz, not a
 * verdict built on zero data. `answers` are the raw answers behind `result`;
 * without them the verdict reads as before.
 */
export function warmupVerdict(
  result: WarmupResult | null,
  answers: readonly WarmupAnswer[] = [],
): WarmupVerdict | null {
  if (!result || result.answered === 0) return null;

  const stated = Math.round(result.mean_confidence);
  const actual = Math.round(result.accuracy * 100);
  const same = sharedConfidence(answers);

  return {
    title: TITLES[result.direction],
    detail:
      same === null
        ? `You were ${stated}% confident on average, and right ${actual}% of the time.`
        : `You said ${same}% on all ${answers.length}, and were right ${actual}% of the time.`,
    advice: ADVICE[result.direction],
    // Nothing to tell apart when every answer was right.
    sameNumber: same !== null && result.accuracy < 1 ? SAME_NUMBER_NOTE : null,
    trickyNote: result.direction === 'overconfident' ? TRICKY_NOTE : null,
  };
}

// Presentation helper: turn a scored Warmup into the words on the result
// screen. Pure and testable, in the same spirit as stats/ratingHeadline.ts —
// the copy rules live in one place rather than inline in JSX.
//
// The headline is the Day-0 aha, and CLAUDE.md gives its exact shape:
// "You were 85% confident but right 55% of the time — you run overconfident."

import type { WarmupAnswer, WarmupQuestion, WarmupResult } from '@/types';

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
   * Under an overconfident verdict only: the ten are drawn at random from
   * reference tables (roadmap D18 (1)), so the verdict can't blame the
   * questions, but ten is a small sample and trivia says little about
   * plans. It says both.
   */
  sampleNote: string | null;
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

const SAMPLE_NOTE =
  'Ten questions is a small sample, and trivia says little about your plans. ' +
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
    sampleNote: result.direction === 'overconfident' ? SAMPLE_NOTE : null,
  };
}

/**
 * One row of the answer key (roadmap step 71). It used to print the prompt
 * and the right option beside a ✓ or ✗, so a miss read "✗ Which is longer? A
 * Boeing 737", as if the 737 were the wrong pick. Now the right answer and
 * the user's own pick are each said in words. A question has two options, so
 * a miss's pick is the other one.
 */
export function answerKeyRow(
  question: WarmupQuestion,
  answer: WarmupAnswer,
): { answer: string; pick: string; spoken: string } {
  const right = question.options[question.correctIndex];
  const picked = answer.correct ? right : question.options[question.correctIndex === 0 ? 1 : 0];
  const pick = answer.correct ? 'You got it' : `You picked \u201C${picked}\u201D`;
  return {
    answer: right,
    pick,
    spoken: `${question.prompt} ${right}. ${pick}, ${answer.confidence}% sure. ${question.fact}`,
  };
}

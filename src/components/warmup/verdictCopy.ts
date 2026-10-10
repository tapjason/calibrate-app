// Presentation helper: turn a scored Warmup into the words on the result
// screen. Pure and testable, in the same spirit as stats/ratingHeadline.ts —
// the copy rules live in one place rather than inline in JSX.
//
// The result leads with counts and reads these questions, not the person
// (roadmap D18 (2)): "You said 85% on average. 5 of 10 were right." under
// "On these ten, you were overconfident".

import type { WarmupAnswer, WarmupQuestion, WarmupResult } from '@/types';

export interface WarmupVerdict {
  /** Short identity line, e.g. "On these ten, you were overconfident". */
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
}

// Says "these ten", not "you run": ten random questions describe those ten,
// not a person (roadmap D18 (2)). The engine names a lean only outside what
// luck commonly does on ten (WARMUP_LEAN_MASS), so `calibrated` here means
// no clear lean, not proof of calibration.
const READS = {
  overconfident: 'you were overconfident',
  underconfident: 'you were underconfident',
  calibrated: 'no clear lean',
} as const;

const NUMBER_WORDS: Record<number, string> = { 10: 'ten' };

const ADVICE = {
  overconfident:
    "When you felt sure, you were right less often than you thought. Try shading your confidence down.",
  underconfident:
    'You knew more than you gave yourself credit for. Try trusting your gut a little further.',
  calibrated:
    "Ten answers can't tell a small lean from luck. Your own predictions are the real test.",
} as const;

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
  const same = sharedConfidence(answers);
  const n = result.answered;
  const right = Math.round(result.accuracy * n);
  // Non-breaking spaces: "right." never wraps alone at 320pt.
  const count = `${right}\u00A0of\u00A0${n}\u00A0were\u00A0right.`;

  return {
    title: `On these ${NUMBER_WORDS[n] ?? n}, ${READS[result.direction]}`,
    detail:
      same === null
        ? `You said ${stated}% on average. ${count}`
        : `You said ${same}% on all ${n}. ${count}`,
    advice: ADVICE[result.direction],
    // Nothing to tell apart when every answer was right.
    sameNumber: same !== null && result.accuracy < 1 ? SAME_NUMBER_NOTE : null,
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

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

/**
 * What to do next, by the lean and by which side of the coin flip the average
 * sat (voice pass, 2026-11-23). The scale runs 0–100 now (the owner, that
 * day), so an average under 50 can't be told "when you feel sure": it reads
 * how the picks came out against the numbers instead. Plain words, no idioms
 * ("shading down", "trusting your gut"): a second-language tester read "gut"
 * as stomach (playtest 2026-11-05).
 */
const ADVICE = {
  overconfident: {
    sure: 'You felt surer than you were. Next time you feel sure, go a little lower.',
    unsure: 'Your picks came true less often than your numbers said. Go a little lower next time.',
  },
  underconfident: {
    sure: 'You knew more than you thought. Next time you feel sure, go a little higher.',
    unsure: 'Your picks came true more often than your numbers said. Go a little higher next time.',
  },
} as const;

/** The average at or above which the advice speaks of feeling sure. */
const SURE_FROM = 50;

/**
 * How many the numbers expected, in words: "about 7", "almost none" when it
 * rounds to 0 ("about 0" read as a count nobody would say), "none" or "all 10"
 * when every answer said 0% or 100%.
 */
function expectedWords(exact: number, n: number): string {
  if (exact === 0) return 'none';
  if (exact === n) return `all ${n}`;
  const rounded = Math.round(exact);
  return rounded === 0 ? 'almost none' : `about ${rounded}`;
}

/**
 * No clear lean, said as what did happen (roadmap D36): "no clear lean" alone,
 * at 9 of 10 right, read as "so… was I good?" (blind playtest 2026-11-01,
 * run 1). The expected count beside the real one is the plain read; the voice
 * pass (2026-11-23) cut the reason it isn't a verdict to "too close to call".
 */
function noLeanAdvice(meanConfidence: number, right: number, n: number): string {
  const word = NUMBER_WORDS[n] ?? String(n);
  const Word = word.charAt(0).toUpperCase() + word.slice(1);
  const questions = n === 1 ? 'question' : 'questions';
  const exact = (meanConfidence / 100) * n;
  const counts = `You expected ${expectedWords(exact, n)} and got ${right}.`;
  if (Math.round(exact) === right) {
    return `${counts} ${Word} ${questions} can't prove it, so your own predictions are the real test.`;
  }
  return `${counts} Too close to call on ${word} ${questions}.`;
}

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
    advice:
      result.direction === 'calibrated'
        ? noLeanAdvice(result.mean_confidence, right, n)
        : ADVICE[result.direction][stated >= SURE_FROM ? 'sure' : 'unsure'],
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
): { answer: string; sentence: string; pick: string; spoken: string } {
  const right = question.options[question.correctIndex];
  const picked = answer.correct ? right : question.options[question.correctIndex === 0 ? 1 : 0];
  const pick = answer.correct ? 'You got it' : `You picked \u201C${picked}\u201D`;
  // One full stop after an answer that already ends in one ("Washington,
  // D.C.", blind playtests 2026-11-12b finding 18 and -12e run 2).
  const sentence = /[.!?]$/.test(right) ? right : `${right}.`;
  return {
    answer: right,
    sentence,
    pick,
    spoken: `${question.prompt} ${sentence} ${pick}, ${answer.confidence}% sure. ${question.fact}`,
  };
}

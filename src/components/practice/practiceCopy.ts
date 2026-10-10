// Words for the daily practice (roadmap step 88). Pure, so tests can hold the
// copy to the engine's numbers; the counting itself comes from the engine
// through practiceStore.
//
// Tone (DESIGN_SYSTEM §7.9 and §7.22): practice is practice. It never claims
// to improve the real score (the evidence for that transfer is mixed,
// research/retention-2026-10.md §2.5), never says which way someone leans on
// fewer than PRACTICE_MIN_N answers, and compares a day in counts, as Wrapped
// and a resolve run do, rather than with a hit rate.

import { expectedPhrase } from '@/components/share/wrappedCopy';
import { PRACTICE_MIN_N, type PracticeDayTally, type PracticeRecord } from '@/types';

export interface PracticeCardCopy {
  title: string;
  detail: string;
  /** What the row does: "Start", "Continue", "See answers". */
  action: string;
  /** One sentence for a screen reader. */
  spoken: string;
  done: boolean;
}

/** Today's row: what's waiting, how far it got, or what it came to. */
export function practiceCardCopy(tally: PracticeDayTally, total: number): PracticeCardCopy {
  if (tally.answered >= total) {
    const title = 'Practice done';
    const detail = `${tally.correct} of ${total} right. New ones tomorrow`;
    return { title, detail, action: 'See answers', spoken: `${title}. ${detail}.`, done: true };
  }
  const title = 'Today’s practice';
  const detail =
    tally.answered === 0
      ? `${total} questions, about 30\u00A0seconds`
      : `${tally.answered} of ${total} answered`;
  const action = tally.answered === 0 ? 'Start' : 'Continue';
  return { title, detail, action, spoken: `${title}. ${detail}.`, done: false };
}

/**
 * The day's result: "2 of 3 right" and "You expected about 2." The expected
 * count is the sum of the stated confidences, rounded for reading, worded as
 * Wrapped's expectedLine.
 */
export function practiceDayCopy(tally: PracticeDayTally): { title: string; detail: string } {
  const expected = expectedPhrase(tally.expected);
  return {
    title: `${tally.correct} of ${tally.answered} right`,
    detail: `You expected ${expected}.`,
  };
}

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/**
 * Everything practised so far. Below PRACTICE_MIN_N, counts and how many more
 * it takes; from there, which way the answers lean, with the two numbers.
 */
export function practiceRecordCopy(record: PracticeRecord): { headline: string; detail: string } {
  const days = `${record.days} ${record.days === 1 ? 'day' : 'days'}`;
  const answered = `${record.answered} answered over ${days}`;
  if (record.direction === null) {
    const more = Math.max(0, PRACTICE_MIN_N - record.answered);
    return {
      headline: `${answered}.`,
      detail: `${more} more and this shows which way you lean.`,
    };
  }
  const said = `${Math.round(record.mean_confidence)}%`;
  const right = pct(record.accuracy);
  const headline =
    record.direction === 'overconfident'
      ? 'In practice, you run overconfident'
      : record.direction === 'underconfident'
        ? 'In practice, you run underconfident'
        : 'In practice, you’re close to calibrated';
  return {
    headline,
    detail: `${answered}: ${said} sure on average, right ${right} of the time.`,
  };
}

/** The line that keeps practice in its place. */
export const PRACTICE_APART =
  'Practice stays apart from your calibration rating, your badges and your streak.';

// Words for the daily practice (roadmap step 88), called "trivia" on screen
// since 2026-11-25 (the owner); the code keeps the name practice. Pure, so
// tests can hold the copy to the engine's numbers; the counting itself comes
// from the engine through practiceStore.
//
// Tone (DESIGN_SYSTEM §7.9 and §7.22): trivia is just for fun. It never claims
// to improve the real score (the evidence for that transfer is mixed,
// research/retention-2026-10.md §2.5), never says which way someone leans on
// fewer than PRACTICE_MIN_N answers, and compares a day in counts, as Wrapped
// and a resolve run do, rather than with a hit rate.

import { chartRead, closeToSaid, rangeLabel, type ChartRead } from '@/components/stats/chartTakeaway';
import { expectedPhrase } from '@/components/stats/expectedPhrase';
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
export function practiceCardCopy(
  tally: PracticeDayTally,
  total: number,
  /**
   * Nothing real answered yet (D62): the title says "While you wait", while
   * the first prediction waits for its day (blind playtest 2026-11-13d,
   * finding 4).
   */
  beforeFirstAnswer = false,
): PracticeCardCopy {
  if (tally.answered >= total) {
    const title = 'Trivia done';
    const detail = `${tally.correct} of ${total} right. New ones tomorrow`;
    return { title, detail, action: 'See answers', spoken: `${title}. ${detail}.`, done: true };
  }
  const waiting = beforeFirstAnswer && tally.answered === 0;
  const title = waiting ? 'While you wait: today’s trivia' : 'Today’s trivia';
  // The voice pass's words (2026-11-23), waiting or not: the title says
  // "While you wait", so "answers today" (D62) went with the text load. No
  // full stop at the end, like the row's other details.
  const detail =
    tally.answered === 0
      ? `${total} quick questions. About 30\u00A0seconds`
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
 * The record's headline. It must agree with the chart under it, which marks
 * each range by the lean rule, and with the pooled line under it ("29
 * answered over 12 days: 71% sure on average, right 55% of the time."). In
 * this order:
 *  1. A range the lean rule names, over ranges with 10 answers or more
 *     (`chartRead`, Insights' chart title rule): both sides in Insights' words,
 *     or the one range.
 *  2. "Close to calibrated" only when every such range is within 5 points of
 *     what was said and the pooled answers are too (`closeToSaid`, as the
 *     recaps' verdict asks): two ranges on the line beside a 95% range of
 *     nine with four right read "close to calibrated" over "71% sure, right
 *     55%" (code review 2026-11-23, round 2).
 *  3. With no range at 10 answers, the pooled lean, by the engine's lean rule
 *     (`record.direction`).
 *  4. Otherwise no clear lean.
 * The pooled answers alone read "close to calibrated" over a too-sure dot and
 * a too-cautious one (ten at 10% all right, ten at 90% all wrong), and over
 * "70% sure, right 55%" (record audit 2026-11-23).
 */
function practiceHeadline(read: ChartRead | null, record: PracticeRecord): string {
  if (read?.kind === 'both') {
    return `In trivia, you’re too sure at ${rangeLabel(read.sure)} and too cautious at ${rangeLabel(read.cautious)}`;
  }
  if (read?.kind === 'lean') {
    return `In trivia, you run ${read.direction} at ${rangeLabel(read.range)}`;
  }
  if (read?.kind === 'calibrated') {
    const pooledClose = closeToSaid(record.mean_confidence, record.accuracy * 100);
    if (read.close && pooledClose) {
      return read.one
        ? `In trivia, you’re close to calibrated at ${rangeLabel(read.shown)}`
        : 'In trivia, you’re close to calibrated';
    }
    return 'In trivia, no clear lean yet';
  }
  if (record.direction === 'overconfident' || record.direction === 'underconfident') {
    return `In trivia, you run ${record.direction}`;
  }
  return 'In trivia, no clear lean yet';
}

/**
 * Everything practised so far. Below PRACTICE_MIN_N, counts and how many more
 * it takes; from there, which way the answers lean by the chart's rule, with
 * the two numbers.
 */
export function practiceRecordCopy(record: PracticeRecord): { headline: string; detail: string } {
  const days = `${record.days} ${record.days === 1 ? 'day' : 'days'}`;
  const answered = `${record.answered} answered over ${days}`;
  // The engine's floor: no direction, and no bands, below PRACTICE_MIN_N.
  if (record.direction === null) {
    const more = Math.max(0, PRACTICE_MIN_N - record.answered);
    return {
      headline: `${answered}.`,
      detail: `${more} more and this shows which way you lean.`,
    };
  }
  const said = `${Math.round(record.mean_confidence)}%`;
  const right = pct(record.accuracy);
  return {
    headline: practiceHeadline(chartRead(record.buckets), record),
    detail: `${answered}: ${said} sure on average, right ${right} of the time.`,
  };
}

/**
 * The line that keeps trivia in its place (voice pass, 2026-11-23: "Practice
 * is just practice."; trivia since 2026-11-25).
 */
export const PRACTICE_APART =
  'Trivia is just for fun. It doesn’t touch your rating, badges or streak.';

// Presentation helper for Calibration Wrapped. Pure and testable, like
// stats/ratingHeadline.ts and warmup/verdictCopy.ts.
//
// The load-bearing rule here: a recap window is usually small, and a verdict
// drawn from a handful of resolutions is noise wearing a conclusion's clothes.
// So `verdict` is null whenever the window is provisional, and the screen
// tells the activity story instead. Counts are always safe to print — they are
// facts, not inferences.
//
// A week almost never reaches MIN_N_OVERALL resolutions, so the weekly card is
// nearly always provisional. It must not read as "not enough data" every
// Sunday: it leads with counts and a receipt from the busiest bucket, and its
// provisional line points at the user's overall progress rather than asking
// for twenty resolutions inside seven days (DESIGN_SYSTEM §7.14).

import { MIN_BUCKET_N_FOR_VERDICT, rangeLabel } from '@/components/stats/chartTakeaway';
import type { WrappedReceipt, WrappedSummary } from '@/engine/wrapped';
import { MIN_N_OVERALL } from '@/types';

export interface WrappedStory {
  title: string;
  /** Plain counts — always safe to show. */
  stat: string;
  /** The same fact split for the card: a big count, then the hit rate. */
  statCount: string;
  statRate: string | null;
  /** The calibration read, or null while the window is too small to support one. */
  verdict: string | null;
  /**
   * One factual line from the busiest confidence bucket ("You said 80–100% 3
   * times. 2 happened."). Counts only, so it shows provisional or not.
   */
  receipt: string | null;
  /** Why there is no verdict yet. Null once there is one. */
  provisionalNote: string | null;
  /** A closing line: honest-uncertainty count, or a nudge toward one. */
  note: string;
}

const TITLES = {
  week: 'Your week in predictions',
  year: 'Your year in predictions',
} as const;

const VERDICTS = {
  overconfident: 'You ran overconfident',
  underconfident: 'You ran underconfident',
  calibrated: 'You ran well calibrated',
} as const;

const EMPTY_NOTE = {
  week: 'Nothing came due this week. Log a prediction and the story starts.',
  year: 'Nothing resolved this year yet.',
} as const;

/** The user's all-time progress toward an unlocked rating, from UserStat. */
export interface OverallProgress {
  resolved: number;
  provisional: boolean;
}

export function wrappedStory(
  summary: WrappedSummary,
  overall?: OverallProgress | null,
  /**
   * Open predictions due within the coming week. An empty week with some on
   * the way says what will be there (DESIGN_SYSTEM §7.14), not "nothing".
   */
  upcoming = 0,
): WrappedStory {
  const { span, resolved } = summary;

  if (resolved === 0 && span === 'week' && upcoming > 0) {
    const plural = upcoming === 1 ? 'prediction' : 'predictions';
    return {
      title: TITLES[span],
      stat: `${upcoming} ${plural} on the way`,
      statCount: `${upcoming} on the way`,
      statRate: null,
      verdict: null,
      receipt: null,
      provisionalNote: null,
      note: `${upcoming === 1 ? 'It comes' : 'They come'} due within the week. This recap fills in as you resolve ${upcoming === 1 ? 'it' : 'them'}.`,
    };
  }

  if (resolved === 0) {
    return {
      title: TITLES[span],
      stat: 'Nothing resolved yet',
      statCount: 'Nothing resolved yet',
      statRate: null,
      verdict: null,
      receipt: null,
      provisionalNote: null,
      note: EMPTY_NOTE[span],
    };
  }

  const hitRate = Math.round(summary.hit_rate * 100);
  const stated = Math.round(summary.mean_confidence);
  const plural = resolved === 1 ? 'prediction' : 'predictions';

  return {
    title: TITLES[span],
    stat: `${resolved} ${plural} resolved · ${hitRate}% came in`,
    statCount: `${resolved} resolved`,
    statRate: `${hitRate}% came in`,
    verdict: summary.score_is_provisional ? null : verdictLine(summary, stated, hitRate),
    receipt: summary.receipt ? receiptLine(summary.receipt) : null,
    provisionalNote: summary.score_is_provisional
      ? provisionalLine(summary, overall)
      : null,
    note: integrityNote(summary),
  };
}

/**
 * The window's calibration read, by the same rule as the Stats chart title
 * (chartTakeaway): the worst bucket with enough in it names the direction and
 * the range. Averages alone can cancel — underconfident in the middle and
 * overconfident at the top averages out to "well calibrated" while Stats says
 * "overconfident at 80–100%" — so the averages only speak when every
 * well-evidenced bucket agrees, or when no bucket is big enough to say more.
 */
function verdictLine(summary: WrappedSummary, stated: number, hitRate: number): string {
  const averages = `${stated}% confident on average, right ${hitRate}% of the time.`;
  const solid = summary.buckets.filter((b) => b.total_resolved >= MIN_BUCKET_N_FOR_VERDICT);
  if (solid.length === 0) return `${VERDICTS[summary.direction]} — ${averages}`;

  const worst = solid.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a));
  if (worst.direction === 'calibrated') return `${VERDICTS.calibrated} — ${averages}`;
  return `${VERDICTS[worst.direction]} at ${rangeLabel(worst)}.`;
}

/**
 * Why there's no verdict. A year can plausibly reach the minimum, so it gets
 * the countdown. A week can't, so it points at the unlock that is actually in
 * reach — the overall rating — or, once that's unlocked, at where it lives.
 */
function provisionalLine(
  summary: WrappedSummary,
  overall: OverallProgress | null | undefined,
): string {
  if (summary.span === 'year') {
    return `${MIN_N_OVERALL - summary.resolved} more resolutions and this year earns a calibration read.`;
  }
  if (overall?.provisional) {
    return `${overall.resolved} of ${MIN_N_OVERALL} resolutions toward your first calibration score.`;
  }
  return 'A week is too short for a verdict. Your all-time score has the full story.';
}

/** "You said 80–100% 3 times. 2 happened." Bucket labels match TrendsPanel. */
export function receiptLine(receipt: WrappedReceipt): string {
  const { low, high, said, happened } = receipt;
  const range = `${low}–${high}%`;
  if (said === 1) {
    return `You said ${range} once. ${happened === 1 ? 'It happened.' : "It didn't."}`;
  }
  const outcome =
    happened === said
      ? said === 2
        ? 'Both happened.'
        : `All ${said} happened.`
      : happened === 0
        ? 'None of them happened.'
        : `${happened} of ${said} happened.`;
  return `You said ${range} ${said} times. ${outcome}`;
}

/**
 * The closing line. Honest-uncertainty logging is the behavior the app most
 * wants to reinforce (CLAUDE.md: integrity bonus), so it gets the last word —
 * praised when present, nudged when absent.
 */
function integrityNote(summary: WrappedSummary): string {
  const { integrity_count: n } = summary;
  if (n === 0) {
    return 'No coin-flip calls this time. The 35–65% ones teach you the most.';
  }
  const plural = n === 1 ? 'call' : 'calls';
  return `${n} honest-uncertainty ${plural} logged — the most valuable kind.`;
}

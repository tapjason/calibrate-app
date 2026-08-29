// Presentation helper for Calibration Wrapped. Pure and testable, like
// stats/ratingHeadline.ts and warmup/verdictCopy.ts.
//
// The load-bearing rule here: a recap window is usually small, and a verdict
// drawn from a handful of resolutions is noise wearing a conclusion's clothes.
// So `verdict` is null whenever the window is provisional, and the screen
// tells the activity story instead. Counts are always safe to print — they are
// facts, not inferences.

import type { WrappedSummary } from '@/engine/wrapped';
import { MIN_N_OVERALL } from '@/types';

export interface WrappedStory {
  title: string;
  /** Plain counts — always safe to show. */
  stat: string;
  /** The calibration read, or null while the window is too small to support one. */
  verdict: string | null;
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

export function wrappedStory(summary: WrappedSummary): WrappedStory {
  const { span, resolved } = summary;

  if (resolved === 0) {
    return {
      title: TITLES[span],
      stat: 'Nothing resolved yet',
      verdict: null,
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
    verdict: summary.score_is_provisional
      ? null
      : `${VERDICTS[summary.direction]} — ${stated}% confident on average, right ${hitRate}% of the time.`,
    provisionalNote: summary.score_is_provisional
      ? `${MIN_N_OVERALL - resolved} more resolutions and this window earns a calibration read.`
      : null,
    note: integrityNote(summary),
  };
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

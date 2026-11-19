import { categoryLabel } from '@/store/categoryStore';
import { isBuiltInCategory, type Category, type CoachEvidenceSource } from '@/types';

export interface CoachReceipt {
  /** The figure, formatted as the user sees it elsewhere ("62%", "24"). */
  figure: string;
  /** What it counts ("came true in finance"). */
  label: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The receipt line on a Coach card (DESIGN_SYSTEM §7.13): the validated
 * evidence number and what it counts, so the user can check the Coach against
 * the chart above it. Shows the figure the app computed, not the model's
 * rounding of it. Null for a figure it can't describe — the card then just
 * leaves the receipt off.
 */
export function coachReceipt(
  source: CoachEvidenceSource,
  /**
   * How a category reads mid-sentence: the card's own, so "Your own
   * category" in the header isn't named in the receipt under it while the
   * words are hidden (code review, 2026-11-14).
   */
  label: (category: Category) => string = categoryLabel,
): CoachReceipt | null {
  const { field, value, kind } = source;
  // A built-in under the name the person gave it (roadmap D39).
  const scope = source.scope === 'overall' ? 'overall' : label(source.scope);
  const round = Math.round(value);
  switch (field) {
    case 'calibration_rating':
      return { figure: String(round), label: 'your calibration rating' };
    case 'total_resolved':
      return { figure: String(round), label: 'scored in total' };
    case 'resolved':
      return { figure: String(round), label: `scored in ${scope}` };
    case 'calibration_score':
      // "your own category score", not "your your own…" (code review, 2026-11-14).
      return {
        figure: String(round),
        label: `${scope.startsWith('your ') ? scope : `your ${scope}`} score`,
      };
    case 'mean_stated_confidence':
      return { figure: `${round}%`, label: `average confidence in ${scope}` };
    case 'actual_rate':
      return { figure: `${Math.round(value * 100)}%`, label: `came true in ${scope}` };
    case 'pattern':
      return patternReceipt(kind, value, label);
  }
}

function patternReceipt(
  kind: string | undefined,
  value: number,
  label: (category: Category) => string,
): CoachReceipt | null {
  if (kind === 'weakest_day_of_week') {
    const day = DAYS[value];
    return day ? { figure: day, label: 'your least calibrated day' } : null;
  }
  if (kind === 'weakest_day_score') {
    return { figure: String(Math.round(value)), label: 'score on your least calibrated day' };
  }
  const drift = kind?.match(/^drift_(\w+)$/);
  if (drift) {
    // Only a built-in's drift is ever sent (coachPatterns' DRIFT_PREFIX);
    // anything else has no category to name, so no receipt.
    const category = drift[1];
    if (!isBuiltInCategory(category)) return null;
    // Through the card's own label, as the header and the other receipts are:
    // the bare id named "health" under a header that read "Your own category"
    // while the words were hidden, and under a rename (security review,
    // 2026-11-18).
    const scope = label(category);
    const delta = Math.round(value);
    const figure = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
    return {
      figure,
      label: `change in ${scope.startsWith('your ') ? scope : `your ${scope}`} score, earlier to recent`,
    };
  }
  return null;
}

import type { CoachEvidenceSource } from '@/types';

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
export function coachReceipt(source: CoachEvidenceSource): CoachReceipt | null {
  const { field, scope, value, kind } = source;
  const round = Math.round(value);
  switch (field) {
    case 'calibration_rating':
      return { figure: String(round), label: 'your calibration rating' };
    case 'total_resolved':
      return { figure: String(round), label: 'resolved in total' };
    case 'resolved':
      return { figure: String(round), label: `resolved in ${scope}` };
    case 'calibration_score':
      return { figure: String(round), label: `your ${scope} score` };
    case 'mean_stated_confidence':
      return { figure: `${round}%`, label: `average confidence in ${scope}` };
    case 'actual_rate':
      return { figure: `${Math.round(value * 100)}%`, label: `came true in ${scope}` };
    case 'pattern':
      return patternReceipt(kind, value);
  }
}

function patternReceipt(kind: string | undefined, value: number): CoachReceipt | null {
  if (kind === 'weakest_day_of_week') {
    const day = DAYS[value];
    return day ? { figure: day, label: 'your least calibrated day' } : null;
  }
  if (kind === 'weakest_day_score') {
    return { figure: String(Math.round(value)), label: 'score on your least calibrated day' };
  }
  const drift = kind?.match(/^drift_(\w+)$/);
  if (drift) {
    const delta = Math.round(value);
    const figure = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
    return { figure, label: `change in your ${drift[1]} score, earlier to recent` };
  }
  return null;
}

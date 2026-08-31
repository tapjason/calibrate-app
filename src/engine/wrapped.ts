// Calibration Wrapped (L3). Rolls a window of resolved predictions into the
// recap the Share/Wrapped screen tells a story from.
//
// Pure like the rest of the engine: plain objects in, plain objects out, no
// I/O and no clock of its own — the caller passes `now`. Windows are computed
// in UTC to match the streak and pattern engines, which deliberately don't
// trust a device's local offset.
//
// Layer rule: imports only from @/types and sibling engine files.

import {
  MIN_N_OVERALL,
  type Category,
  type Direction,
  type Prediction,
} from '@/types';

import { computeCalibrationPoints } from './calibration';
import { classifyDirection } from './patterns';

export type WrappedSpan = 'week' | 'year';

export interface WrappedCategory {
  category: Category;
  resolved: number;
  score: number;
  direction: Direction;
}

export interface WrappedSummary {
  span: WrappedSpan;
  /** Window bounds, ISO. Inclusive of both ends: [start, end]. */
  start: string;
  end: string;

  resolved: number;
  hit_rate: number; // resolved_yes / resolved, 0–1
  mean_confidence: number; // 0–100
  score: number; // calibration score over the window
  direction: Direction;

  /**
   * True while `resolved` is under MIN_N_OVERALL. The score is still computed
   * — a trend needs it — but the UI must not headline it (CLAUDE.md). Most
   * weekly recaps will be provisional, which is correct: a week is rarely
   * twenty resolutions, and the weekly story is the activity, not a number.
   */
  score_is_provisional: boolean;

  /** Categories active in the window, strongest calibration first. */
  categories: WrappedCategory[];
  /** Resolutions logged at 35–65% confidence — the honest-uncertainty ones. */
  integrity_count: number;
  /** Highest-confidence call that came in, and the one that didn't. */
  boldest_hit: Prediction | null;
  biggest_miss: Prediction | null;
}

/** Predictions that count: yes/no outcomes only (skips and pending excluded). */
function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

const toPoints = (ps: readonly Prediction[]) =>
  ps.map((p) => ({ confidence: p.confidence, yes: p.status === 'resolved_yes' }));

/**
 * The seven-day window ending at `now`. Seven days back, not "since Sunday":
 * a recap that shrinks to a few hours when the user opens it on a Sunday night
 * would be a worse story every week.
 *
 * The end is inclusive, and that matters — a prediction resolved in the same
 * millisecond the recap is built is exactly the one the user just acted on,
 * and it would be baffling to leave it out.
 */
export function weekWindow(now: Date): { start: string; end: string } {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

/** The calendar year containing `now`, in UTC, from Jan 1 to the last instant of Dec 31. */
export function yearWindow(now: Date): { start: string; end: string } {
  const year = now.getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    end: new Date(Date.UTC(year + 1, 0, 1) - 1).toISOString(),
  };
}

/**
 * Resolved predictions whose resolved_at falls in [start, end], both inclusive.
 *
 * Compared as instants, not as strings. Locally-written timestamps are all
 * canonical `...Z`, but `upsertPredictionFromRemote` stores what PostgREST
 * sends verbatim, and `2026-08-29T12:00:00+00:00` does not sort against
 * `2026-08-29T12:00:00.000Z` — '+' precedes '.' in ASCII, so a row synced from
 * another device could fall on the wrong side of a boundary. The sibling
 * engines (patterns, streak) already parse; this now matches them.
 */
export function inWindow(
  resolved: readonly Prediction[],
  start: string,
  end: string,
): Prediction[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  return resolved.filter((p) => {
    if (!isYesNo(p) || p.resolved_at === null) return false;
    const at = Date.parse(p.resolved_at);
    // An unparseable timestamp belongs to no window rather than to every one.
    if (Number.isNaN(at)) return false;
    return at >= startMs && at <= endMs;
  });
}

function rollUpCategories(preds: readonly Prediction[]): WrappedCategory[] {
  const byCategory = new Map<Category, Prediction[]>();
  for (const p of preds) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const out: WrappedCategory[] = [];
  for (const [category, list] of byCategory) {
    const { rating } = computeCalibrationPoints(toPoints(list));
    const meanConfidence =
      list.reduce((s, p) => s + p.confidence, 0) / list.length;
    const hitRate =
      list.filter((p) => p.status === 'resolved_yes').length / list.length;
    out.push({
      category,
      resolved: list.length,
      score: rating,
      direction: classifyDirection(meanConfidence, hitRate),
    });
  }

  // Strongest first; ties go to the better-evidenced category.
  return out.sort((a, b) => b.score - a.score || b.resolved - a.resolved);
}

/**
 * Highest-confidence prediction with the given outcome. Ties break toward the
 * more recent one, so a repeated bold call reads as the current story.
 */
function boldest(
  preds: readonly Prediction[],
  status: 'resolved_yes' | 'resolved_no',
): Prediction | null {
  const matching = preds.filter((p) => p.status === status);
  if (matching.length === 0) return null;
  return matching.reduce((best, p) => {
    if (p.confidence !== best.confidence) {
      return p.confidence > best.confidence ? p : best;
    }
    return (p.resolved_at ?? '') > (best.resolved_at ?? '') ? p : best;
  });
}

/**
 * The zeroed body of an empty recap. A factory, not a constant: as a constant
 * every caller shared one `categories` array instance, since spreading the
 * object copies the reference rather than the array.
 */
const emptyBody = () => ({
  resolved: 0,
  hit_rate: 0,
  mean_confidence: 0,
  score: 0,
  direction: 'calibrated' as Direction,
  score_is_provisional: true,
  categories: [] as WrappedCategory[],
  integrity_count: 0,
  boldest_hit: null,
  biggest_miss: null,
});

/**
 * Build the recap for one window. An empty window returns a zeroed summary
 * rather than throwing — "you resolved nothing this week" is a legitimate
 * story, and the screen renders it as one.
 */
export function buildWrapped(
  resolved: readonly Prediction[],
  span: WrappedSpan,
  now: Date,
): WrappedSummary {
  const { start, end } = span === 'week' ? weekWindow(now) : yearWindow(now);
  const preds = inWindow(resolved, start, end);

  if (preds.length === 0) return { span, start, end, ...emptyBody() };

  const { rating } = computeCalibrationPoints(toPoints(preds));
  const meanConfidence =
    preds.reduce((s, p) => s + p.confidence, 0) / preds.length;
  const hitRate =
    preds.filter((p) => p.status === 'resolved_yes').length / preds.length;

  return {
    span,
    start,
    end,
    resolved: preds.length,
    hit_rate: hitRate,
    mean_confidence: meanConfidence,
    score: rating,
    direction: classifyDirection(meanConfidence, hitRate),
    score_is_provisional: preds.length < MIN_N_OVERALL,
    categories: rollUpCategories(preds),
    integrity_count: preds.filter((p) => p.integrity_bonus).length,
    boldest_hit: boldest(preds, 'resolved_yes'),
    biggest_miss: boldest(preds, 'resolved_no'),
  };
}

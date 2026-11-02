// Deterministic pattern derivations (L3). These are the ONLY source of the
// numbers the Coach (Plus, L5) is allowed to talk about — per COACH_AGENT.md the
// app computes every statistic and the model merely interprets it. Everything
// here is a pure function over resolved predictions; nothing calls a model, and
// the Coach never recomputes its own figures.
//
// Layer rule: engine — imports only from @/types and sibling engine files.

import { MIN_N_CATEGORY, MIN_N_OVERALL, type Category, type Prediction } from '@/types';

import { computeCalibrationPoints } from './calibration';
import { categoriesIn } from './categories';
import { classifyDirection as classifyLean } from './direction';
import { localParts } from './localTime';

// classifyDirection lives in ./direction so the calibration core can label
// each bucket with it; re-exported here for existing callers.
export { classifyDirection } from './direction';

/** Predictions that count: yes/no outcomes only (skips/pending excluded). */
function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

export interface DayOfWeekStat {
  day: number; // 0 = Sunday … 6 = Saturday, the device's local weekday of resolved_at
  resolved: number; // yes/no count on that weekday
  hit_rate: number; // resolved_yes / resolved, 0–1
  score: number; // calibration score (0–100) for that weekday's predictions
}

/**
 * Per-weekday breakdown of resolved predictions, keyed by the LOCAL weekday of
 * `resolved_at`. Only weekdays with at least one yes/no resolution appear, and
 * the result is sorted Sunday→Saturday. Local, because this becomes a sentence
 * the Coach says to the user about "your Mondays" — in UTC, a US user's
 * Monday-evening resolutions would be filed under Tuesday.
 */
export function dayOfWeekAccuracy(
  resolved: readonly Prediction[],
): DayOfWeekStat[] {
  const byDay = new Map<number, Prediction[]>();
  for (const p of resolved) {
    if (!isYesNo(p) || !p.resolved_at) continue;
    const day = localParts(new Date(p.resolved_at)).weekday;
    const list = byDay.get(day) ?? [];
    list.push(p);
    byDay.set(day, list);
  }

  const out: DayOfWeekStat[] = [];
  for (const [day, preds] of byDay) {
    const yes = preds.filter((p) => p.status === 'resolved_yes').length;
    const { rating } = computeCalibrationPoints(
      preds.map((p) => ({
        confidence: p.confidence,
        yes: p.status === 'resolved_yes',
      })),
    );
    out.push({
      day,
      resolved: preds.length,
      hit_rate: yes / preds.length,
      score: rating,
    });
  }
  return out.sort((a, b) => a.day - b.day);
}

/**
 * The weakest-calibrated weekday among those with enough data to be worth
 * mentioning — the raw material for a "your <weekday> predictions run off"
 * insight. Returns null when no weekday clears `minResolved`.
 */
export function weakestDayOfWeek(
  resolved: readonly Prediction[],
  minResolved = 5,
): DayOfWeekStat | null {
  const eligible = dayOfWeekAccuracy(resolved).filter(
    (d) => d.resolved >= minResolved,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((worst, d) => (d.score < worst.score ? d : worst));
}

export interface CategoryDrift {
  earlier_score: number; // calibration score over the older half
  recent_score: number; // calibration score over the newer half
  delta: number; // recent − earlier (positive = improving)
}

/**
 * Whether a category's calibration is trending up or down: split its resolved
 * predictions in time (by resolved_at) into an older and a newer half and diff
 * the two scores. Needs at least 4 resolutions (2 per half) to be meaningful;
 * returns null below that. On an odd count the newer half takes the extra one.
 */
export function categoryDrift(
  resolvedForCategory: readonly Prediction[],
  minResolved = 4,
): CategoryDrift | null {
  const yesNo = resolvedForCategory
    .filter((p) => isYesNo(p) && p.resolved_at)
    .sort((a, b) => (a.resolved_at! < b.resolved_at! ? -1 : 1));

  if (yesNo.length < minResolved) return null;

  const mid = Math.floor(yesNo.length / 2);
  const toPoints = (ps: Prediction[]) =>
    ps.map((p) => ({ confidence: p.confidence, yes: p.status === 'resolved_yes' }));

  const earlier = computeCalibrationPoints(toPoints(yesNo.slice(0, mid))).rating;
  const recent = computeCalibrationPoints(toPoints(yesNo.slice(mid))).rating;

  return {
    earlier_score: earlier,
    recent_score: recent,
    delta: recent - earlier,
  };
}

/** The category furthest from what was said, in plain counts (roadmap D37). */
export interface CategoryMiss {
  category: Category;
  resolved: number;
  happened: number;
  mean_stated: number; // 0–100
  actual_rate: number; // 0–1
  direction: 'overconfident' | 'underconfident';
}

/**
 * The category whose answers sit furthest from what was said, among those
 * past MIN_N_CATEGORY whose gap passes the one lean rule (D35), or null when
 * none does (roadmap D37). A power user's finance calls were 18 at about 85%
 * with 8 happening, and no screen said so; she found it with History's
 * filters (blind playtest 2026-11-01, run 3). Largest gap first; ties go to
 * the category with more answers, then the app's category order.
 */
export function furthestOffCategory(resolved: readonly Prediction[]): CategoryMiss | null {
  let best: CategoryMiss | null = null;
  for (const category of categoriesIn(resolved)) {
    const list = resolved.filter((p) => p.category === category && isYesNo(p));
    if (list.length < MIN_N_CATEGORY) continue;
    const happened = list.filter((p) => p.status === 'resolved_yes').length;
    const meanStated = list.reduce((s, p) => s + p.confidence, 0) / list.length;
    const rate = happened / list.length;
    const direction = classifyLean(meanStated, rate, list.length);
    if (direction === 'calibrated') continue;
    const gap = Math.abs(meanStated / 100 - rate);
    const bestGap = best ? Math.abs(best.mean_stated / 100 - best.actual_rate) : -1;
    if (!best || gap > bestGap + 1e-9 || (Math.abs(gap - bestGap) <= 1e-9 && list.length > best.resolved)) {
      best = {
        category,
        resolved: list.length,
        happened,
        mean_stated: meanStated,
        actual_rate: rate,
        direction,
      };
    }
  }
  return best;
}

/** The rating now against a week ago (roadmap D37), with the answers between. */
export interface WeekChange {
  before: number;
  now: number;
  answered: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Since last week" (roadmap D37): the rating over every yes/no answer now
 * against the rating over those answered before seven days ago, and how many
 * came in between. Null unless the rating is unlocked at both ends
 * (MIN_N_OVERALL) and something was answered this week: a week with nothing
 * answered has no change to report. Nothing free showed change over time.
 */
export function weekChange(resolved: readonly Prediction[], now: Date): WeekChange | null {
  const all = resolved.filter((p) => isYesNo(p) && p.resolved_at !== null);
  const cutoff = now.getTime() - WEEK_MS;
  const earlier = all.filter((p) => new Date(p.resolved_at!).getTime() <= cutoff);
  const answered = all.length - earlier.length;
  if (answered === 0 || earlier.length < MIN_N_OVERALL || all.length < MIN_N_OVERALL) return null;
  const toPoints = (ps: Prediction[]) =>
    ps.map((p) => ({ confidence: p.confidence, yes: p.status === 'resolved_yes' }));
  return {
    before: Math.round(computeCalibrationPoints(toPoints(earlier)).rating),
    now: Math.round(computeCalibrationPoints(toPoints(all)).rating),
    answered,
  };
}

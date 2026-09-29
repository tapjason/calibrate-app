// Deterministic pattern derivations (L3). These are the ONLY source of the
// numbers the Coach (Plus, L5) is allowed to talk about — per COACH_AGENT.md the
// app computes every statistic and the model merely interprets it. Everything
// here is a pure function over resolved predictions; nothing calls a model, and
// the Coach never recomputes its own figures.
//
// Layer rule: engine — imports only from @/types and sibling engine files.

import type { Prediction } from '@/types';

import { computeCalibrationPoints } from './calibration';
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

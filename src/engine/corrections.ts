// How long an answer stays open to correction (roadmap D34, decided
// 2026-11-01). Layer rule: L3, imports only from @/types.

import type { Prediction } from '@/types';

/**
 * For this long after a Yes or No, its details can change the answer, move it
 * to another category or delete it; after that it is the record. Long enough
 * to catch a mis-tap or a misfiled one the next day, short enough that an
 * answer can't be rewritten once its outcome is old news.
 */
export const CORRECTION_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * When the window closes for an answered prediction, or null for one that
 * has none: open, a skip (a skip can be answered later instead, roadmap step
 * 39), or a row with no readable answer time. Measured from the first answer:
 * a correction keeps `resolved_at`, so correcting can't stretch the window.
 */
export function correctableUntil(p: Prediction): Date | null {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return null;
  if (p.resolved_at === null) return null;
  const at = new Date(p.resolved_at).getTime();
  if (Number.isNaN(at)) return null;
  return new Date(at + CORRECTION_WINDOW_HOURS * HOUR_MS);
}

/** Whether a Yes or No can still be corrected, re-filed or deleted now. */
export function canCorrect(p: Prediction, now: Date): boolean {
  const until = correctableUntil(p);
  return until !== null && now.getTime() < until.getTime();
}

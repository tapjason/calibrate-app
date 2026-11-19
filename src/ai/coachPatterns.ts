// The pattern kinds the Coach context carries (COACH_AGENT.md §4). One list,
// read by the builder (coachContext.ts) and the validator (coachValidate.ts).
// The Edge Function accepts exactly these and nothing else
// (supabase/functions/coach/contract.ts); coachThresholds.test.ts pins its
// copies to these.

import { MIN_N_BAND } from '@/types';

/** The weakest weekday, 0 = Sunday … 6 = Saturday. Never citable: a day, not a figure. */
export const WEEKDAY_KIND = 'weakest_day_of_week';
/** That weekday's 0–100 calibration score. */
export const WEEKDAY_SCORE_KIND = 'weakest_day_score';
/**
 * Scored answers on that weekday (added 2026-11-18). Carried so both
 * validators can check the weekday's floor; never citable. Builds before it
 * don't send it, and their weekday score is then never citable.
 */
export const WEEKDAY_ANSWERS_KIND = 'weakest_day_answers';
/** `drift_<built-in category>`: newer half's score minus older half's. */
export const DRIFT_PREFIX = 'drift_';

/**
 * Scored answers the weakest weekday needs before its score may be shown:
 * MIN_N_BAND, the app's floor for saying anything about a slice of answers.
 * The app shows no weekday figure anywhere else, so it has no floor of its own.
 */
export const WEEKDAY_MIN_N = MIN_N_BAND;

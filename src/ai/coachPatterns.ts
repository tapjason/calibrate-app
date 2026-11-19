// The pattern kinds the Coach context carries (COACH_AGENT.md §4). One list,
// read by the builder (coachContext.ts) and the validator (coachValidate.ts).
// The Edge Function accepts exactly these and nothing else
// (supabase/functions/coach/contract.ts); coachThresholds.test.ts pins its
// copies to these.

import { MIN_N_CATEGORY } from '@/types';

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
 * `drift_half_answers_<built-in category>` (added 2026-11-19): the scored
 * answers in the smaller of the two halves that category's drift compares
 * (the older half, `categoryDrift`'s split). Carried so both validators can
 * check that each half holds MIN_N_CATEGORY answers; never citable. Builds
 * before it don't send it, and their drift is then never citable. Checked
 * before DRIFT_PREFIX everywhere, since it starts with it.
 */
export const DRIFT_HALF_ANSWERS_PREFIX = 'drift_half_answers_';

/**
 * Scored answers the weakest weekday needs before its score may be shown, and
 * each half of a drift: MIN_N_CATEGORY, the floor for any figure the Coach
 * cites (main session's decision, 2026-11-19: no figure from fewer than 20
 * answers). It was MIN_N_BAND (10) from 2026-11-18.
 */
export const WEEKDAY_MIN_N = MIN_N_CATEGORY;
export const DRIFT_HALF_MIN_N = MIN_N_CATEGORY;

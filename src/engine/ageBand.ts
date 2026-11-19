// The one predicate behind the under-13 rule (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md, the main session's call 1).
//
// Apple's sandbox table gives under 13 as (lowerBound: nil, upperBound: 12),
// its ranges inclusive; Apple's `upperBound` reference page reads as if it
// would be 13. Both readings count. A band whose upper bound is 13 or lower
// and whose lower bound is open or below 13 includes children under 13, so
// it is treated as under 13, even when a region's own gate (14, say) is why
// a 13-year-old shares it: the rule fails closed.
//
//   true:  (null, 12) (null, 11) (9, 12) (null, 13) (12, 13)
//   false: (13, 15) (13, 16) (16, 17) (18, null) (null, 15) (null, 17), no band
//
// Layer rule: L3. Pure; imports @/types only.

import { LOCAL_ONLY_BELOW_AGE, type AgeBucket } from '@/types';

/** A bound that is a real number, or null for an open side (undefined counts as open). */
function boundOf(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : 'invalid';
}

/**
 * Whether `bucket` includes ages under `LOCAL_ONLY_BELOW_AGE` (13): an upper
 * bound of 13 or lower, and a lower bound that is open or under 13. No band
 * is false (the app goes on as before: declined, unavailable, older iOS,
 * web). A bound that isn't a number is not a band the app would have stored
 * (src/age/ageRange.ts checks every response) and reads as false.
 */
export function isUnder13Band(bucket: AgeBucket | null | undefined): boolean {
  if (bucket === null || bucket === undefined || typeof bucket !== 'object') return false;
  const upper = boundOf(bucket.upperBound);
  const lower = boundOf(bucket.lowerBound);
  if (upper === null || upper === 'invalid' || lower === 'invalid') return false;
  return upper <= LOCAL_ONLY_BELOW_AGE && (lower === null || lower < LOCAL_ONLY_BELOW_AGE);
}

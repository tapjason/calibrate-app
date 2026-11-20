// The one predicate behind the under-13 rule (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md, the main session's call 1, widened
// by its review call of the same day).
//
// A band counts as under 13 when it can include someone under 13 and has a
// top: its upper bound is set, and its lower bound is open or below 13. Apple's
// sandbox table gives under 13 as (lowerBound: nil, upperBound: 12), its ranges
// inclusive, and Apple says the gates a region uses "may differ from the age
// gates you specify": a region whose first gate is 14, 15 or 17 can answer a
// child with (nil, 15) or (12, 15). Each of those includes ages under 13, so
// each counts, even though a 13-year-old (or 16-year-old) can share it: the
// rule fails closed.
//
//   true:  (null, 12) (null, 11) (9, 12) (null, 13) (12, 13) (null, 15)
//          (null, 17) (12, 15)
//   false: (13, 15) (13, 16) (16, 17) (18, null) (null, null), no band
//
// A band with no top is never under 13, whatever its lower bound: (18, null)
// is an adult's, (null, null) is no band at all, and (12, null) reads false
// too.
//
// Malformed input (nothing the app keeps: src/age/ageRange.ts checks every
// band before the age store sees it) fails closed wherever that can't make a
// band whose lower bound says 18 or over local-only:
//
//   - A bound that is there but isn't a finite number (a string, NaN,
//     Infinity) can't be read, and counts as under 13: (null, NaN),
//     ('x', 12), (13, 'x'), (16, Infinity) and ('x', 'y') are true. A
//     readable lower bound of 18 or over keeps it false: (18, 'x').
//   - No top stays false, whatever the lower bound: ('x', null).
//   - A lower bound above the upper contradicts itself and counts as under
//     13, unless the lower bound is 18 or over: (14, 12) and (16, 15) are
//     true, (18, 12) is false.
//   - A value that isn't a band object at all (a string, a number, an array),
//     or one whose bounds throw when read, counts as under 13. Null and
//     undefined are no band: false. A missing bound is open, like null: {} is
//     no band.
//
// Layer rule: L3. Pure; imports @/types only.

import { LOCAL_ONLY_BELOW_AGE, type AgeBucket } from '@/types';

/**
 * A lower bound at or above this says the band is an adult's: the one thing
 * that keeps a malformed band from counting as under 13. Apple's top gate in
 * the app's request (src/age/ageRange.ts) is 18.
 */
const ADULT_FROM_AGE = 18;

/** A bound: a finite number, `null` for an open side (undefined counts as open), or unreadable. */
function boundOf(value: unknown): number | null | 'unreadable' {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : 'unreadable';
}

/**
 * Whether `bucket` can include ages under `LOCAL_ONLY_BELOW_AGE` (13): an upper
 * bound that is set, and a lower bound that is open or under 13. No band
 * (null, undefined, or both sides open) is false: the app goes on as before
 * (declined, unavailable, older iOS, web). Malformed input counts as under 13
 * unless its lower bound reads 18 or over (see the file's header). Never
 * throws.
 */
export function isUnder13Band(bucket: AgeBucket | null | undefined): boolean {
  if (bucket === null || bucket === undefined) return false;
  if (typeof bucket !== 'object' || Array.isArray(bucket)) return true;
  let lower: number | null | 'unreadable';
  let upper: number | null | 'unreadable';
  try {
    lower = boundOf(bucket.lowerBound);
    upper = boundOf(bucket.upperBound);
  } catch {
    // A bound that throws when read can't be read at all.
    return true;
  }
  if (typeof lower === 'number' && lower >= ADULT_FROM_AGE) return false;
  if (upper === null) return false;
  if (lower === 'unreadable' || upper === 'unreadable') return true;
  if (lower !== null && lower > upper) return true;
  return lower === null || lower < LOCAL_ONLY_BELOW_AGE;
}

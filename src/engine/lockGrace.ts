// "Lock after" (roadmap D75): whether the app opens on its lock when it comes
// back to the front, or at launch.
//
// The owner, 2026-11-23: "users should not have to unlock the phone if they
// are already opening the app ... Only if they step away". So with the lock
// on, coming back within the chosen time of leaving opens straight in, and
// later locks. The time away is measured from the moment the app last went to
// the background while the lock was on and open (`awaySince`, which the lock
// store keeps on the phone so a restart counts the same).
//
// Every doubt locks: no time away, one that doesn't read as an instant, one
// in the future (the clock moved back), a clock that isn't a number, or a
// grace that isn't one of the choices. Immediately (0) always locks. A lock
// already up stays up: once up, only a passed check from a tap on Unlock opens
// it (D74), never time or a return.
//
// Layer rule: L3. Pure: the clock is passed in, never read here.

import { isLockGraceMinutes, isStoredInstant, type LockOnReturn } from '@/types';

const MS_PER_MINUTE = 60_000;

/**
 * True to lock. Opens (false) only when the lock isn't already up, the grace
 * is more than 0, `awaySince` reads, `now` is at or after it, and no more than
 * the grace has passed: exactly at the limit opens, a millisecond over locks.
 */
export const lockOnReturn: LockOnReturn = ({ graceMinutes, awaySince, now, alreadyLocked }) => {
  if (alreadyLocked) return true;
  if (!isLockGraceMinutes(graceMinutes) || graceMinutes === 0) return true;
  if (!isStoredInstant(awaySince)) return true;
  if (typeof now !== 'number' || !Number.isFinite(now)) return true;
  // Parsed on its milliseconds alone, as `isStoredInstant` checks it.
  const since = Date.parse(awaySince.replace(/(\.\d{3})\d+/, '$1'));
  if (!Number.isFinite(since)) return true;
  const away = now - since;
  if (away < 0) return true;
  return away > graceMinutes * MS_PER_MINUTE;
};

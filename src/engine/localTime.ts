// Local calendar fields for the engine (L3).
//
// Streaks, weekday patterns, monthly trends and the yearly Wrapped all speak
// in the user's calendar: "your Mondays", "January", "a 5-day streak". Those
// are local ideas — in UTC, a Pacific-time user's Monday evening is Tuesday —
// so the engine reads days in the device's own zone. That's not a question of
// trusting the clock; the zone is on the device, offline.
//
// Production reads the plain Date getters. Tests can't change the zone those
// use (Jest's sandbox gets a copy of process.env; jest.globalSetup.js pins the
// real one to UTC), so `__setTimeZoneForTests` swaps in an explicit IANA zone
// computed through Intl instead.
//
// Layer rule: engine — no imports beyond the language.

export interface LocalParts {
  year: number;
  /** 0–11, like Date#getMonth. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

let zoneOverride: string | null = null;

/** Test-only: read calendars in `zone` instead of the device's. Null resets. */
export function __setTimeZoneForTests(zone: string | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setTimeZoneForTests is only allowed when NODE_ENV=test');
  }
  zoneOverride = zone;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function partsInZone(date: Date, zone: string): LocalParts {
  const fields: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date)) {
    fields[part.type] = part.value;
  }
  return {
    year: Number(fields.year),
    month: Number(fields.month) - 1,
    day: Number(fields.day),
    weekday: WEEKDAYS.indexOf(fields.weekday ?? ''),
  };
}

/** The calendar fields of an instant, in the device's zone. */
export function localParts(date: Date): LocalParts {
  if (zoneOverride) return partsInZone(date, zoneOverride);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

/**
 * A local calendar day as a number — days since the epoch, counting local
 * days. Subtracting two gives a DST-proof day difference (no 23- or 25-hour
 * days to round), and it sorts.
 */
export function localDayNumber(date: Date): number {
  const { year, month, day } = localParts(date);
  return Math.round(Date.UTC(year, month, day) / 86_400_000);
}

/** How far the zone's wall clock is ahead of UTC at `date`, in ms. */
function zoneOffsetMs(date: Date, zone: string): number {
  const fields: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    fields.year!,
    fields.month! - 1,
    fields.day!,
    fields.hour!,
    fields.minute!,
    fields.second!,
  );
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant of local midnight at the start of the given calendar date.
 * (`month` 0–11; overflow rolls over like Date's, so month 12 is next January.)
 */
export function localMidnight(year: number, month: number, day: number): Date {
  if (!zoneOverride) return new Date(year, month, day);
  const target = Date.UTC(year, month, day);
  // Correct by the zone's offset near the target, then once more in case that
  // first correction landed across a DST change.
  const first = target - zoneOffsetMs(new Date(target), zoneOverride);
  return new Date(target - zoneOffsetMs(new Date(first), zoneOverride));
}

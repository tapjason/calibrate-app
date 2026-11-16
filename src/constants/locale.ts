// The locale dates, times and counts are written in.
//
// The app's words are English only, so a date in the phone's own language sat
// inside an English sentence: "Due zondag 15 nov", "Log it again, due
// segunda-feira", "It was due 24 de out.." (blind playtests 2026-11-13e run 7
// and 2026-11-14 runs 2 and 5). On a phone in another language they are now
// written in English, keeping that phone's day-and-month order and its 12- or
// 24-hour clock: "Sun 15 Nov" and "19:00" on a Belgian or Brazilian phone. A
// phone already in English keeps its own locale untouched.
//
// "English for that region" (en-BE) is used where the runtime has it. Where it
// only pretends to (en-BR resolves to plain US English on ICU, month first and
// "7:00 PM"), British or US English stands in, whichever matches the phone's
// order, and the clock is passed explicitly (code review, step 181).

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface Resolved {
  /** The region in the phone's locale ("US", "GB"), or null when it names none. */
  region: string | null;
  /** The tag to format with, or undefined for the phone's own locale. */
  tag: string | undefined;
  /** The phone's clock, when the tag above can't be trusted to carry it. */
  hour12: boolean | undefined;
}

let cached: Resolved | null = null;

/** A language, an optional script, an optional region (two letters or three digits). */
const TAG = /^([a-z]{2,3})(?:[-_][a-z]{4})?(?:[-_]([a-z]{2}|\d{3}))?(?:[-_]|$)/i;

/** Whether dates in `locale` put the day before the month, or null if unknown. */
function dayFirst(locale: string | undefined): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatToParts(
      new Date(2000, 0, 2),
    );
    const day = parts.findIndex((p) => p.type === 'day');
    const month = parts.findIndex((p) => p.type === 'month');
    return day < 0 || month < 0 ? null : day < month;
  } catch {
    return null;
  }
}

/** Whether times in `locale` use a 12-hour clock, or null if unknown. */
function twelveHour(locale: string | undefined): boolean | null {
  try {
    // By formatting 13:00: what comes out carries the phone's own 24-hour
    // switch, which a formatter's declared options may not. A locale that
    // writes its own digits ("۱۳") shows no "13" either way, so there the
    // formatter's own word is used.
    const said = new Date(2000, 0, 1, 13).toLocaleTimeString(locale, { hour: 'numeric' });
    if (/[0-9]/.test(said)) return !said.includes('13');
    const resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12;
    return typeof resolved === 'boolean' ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * English for the region in `tag` ("nl-BE" gives "en-BE"), plain "en" when the
 * tag has no region, and undefined (the phone's own locale) when the phone is
 * in English already or the tag can't be read.
 */
export function englishFor(tag: string): string | undefined {
  const m = TAG.exec(tag.trim());
  if (!m) return undefined;
  if (m[1].toLowerCase() === 'en') return undefined;
  return m[2] ? `en-${m[2].toUpperCase()}` : 'en';
}

/** The two-letter region in a locale tag ("en-GB" gives "GB"), or null. */
export function regionOf(tag: string): string | null {
  const m = TAG.exec(tag.trim());
  return m && m[2] && /^[a-z]{2}$/i.test(m[2]) ? m[2].toUpperCase() : null;
}

/**
 * What to format with on a phone whose locale is `tag`. `clockFrom` is where
 * the phone's clock is read: the tag in tests, the phone's own default
 * otherwise, which carries the 24-hour switch in Settings.
 */
function resolve(tag: string, clockFrom: string | undefined): Resolved {
  const region = regionOf(tag);
  const english = englishFor(tag);
  if (english === undefined) return { region, tag: undefined, hour12: undefined };
  const phoneDayFirst = dayFirst(tag);
  // The region's own English when it keeps the phone's order; else British
  // or US English, whichever does.
  const candidate =
    phoneDayFirst === null || dayFirst(english) === phoneDayFirst
      ? english
      : phoneDayFirst
        ? 'en-GB'
        : 'en-US';
  const phoneTwelve = twelveHour(clockFrom);
  return { region, tag: candidate, hour12: phoneTwelve === null ? undefined : phoneTwelve };
}

/**
 * The phone's own 24-Hour Time switch: true for a 12-hour clock, false for a
 * 24-hour one, null where it can't be read (web, tests, a build from before
 * expo-localization). On the owner's iPhone, in US English with 24-Hour Time
 * on, the status bar and the time picker read "19:00" while every sentence
 * the app wrote read "7:00 PM" (2026-11-16): the JavaScript engine's own
 * formatter follows the language's habit, not the switch. The native module is
 * asked for the way that answers null before the package is loaded, as in
 * `answerKeyUnits.ts`.
 */
function phoneTwelveHour(): boolean | null {
  try {
    if (Platform.OS === 'web') return null;
    if (!requireOptionalNativeModule('ExpoLocalization')) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-localization') as {
      getCalendars?: () => ReadonlyArray<{ uses24hourClock?: boolean | null }> | undefined;
    };
    const uses24 = mod.getCalendars?.()?.[0]?.uses24hourClock;
    return typeof uses24 === 'boolean' ? !uses24 : null;
  } catch {
    return null;
  }
}

let readPhoneClock: () => boolean | null = phoneTwelveHour;

function current(): Resolved {
  if (cached !== null) return cached;
  try {
    const base = resolve(new Intl.DateTimeFormat().resolvedOptions().locale, undefined);
    // The phone's switch wins over what the formatter would have written,
    // on a phone in English too (step 185).
    const phone = readPhoneClock();
    cached = phone === null ? base : { ...base, hour12: phone };
  } catch {
    cached = { region: null, tag: undefined, hour12: undefined };
  }
  return cached;
}

/** The locale for every date the app writes; read once per launch. */
export function dateLocale(): string | undefined {
  return current().tag;
}

/**
 * The locale for a grouped count: plain English, "1,234", on every phone. A
 * region's English can group the way its language does ("1.234" under en-BE
 * or en-DE, "1'234" under en-CH), on an English-language phone too, and that
 * reads as a decimal in an English sentence on a card that leaves the phone
 * (record audit, rounds 2 and 3).
 */
export function countLocale(): string {
  return 'en';
}

/**
 * The region of the phone's locale ("US", "GB"), or null when the locale
 * names none. It is the region of the phone's language setting, read on the
 * phone and sent nowhere.
 */
export function deviceRegion(): string | null {
  return current().region;
}

/**
 * A time of day ("19:00", "7:00 PM") in English, on the phone's own clock.
 * Use this, never `toLocaleTimeString` directly.
 */
export function localTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  const { tag, hour12 } = current();
  if (hour12 === undefined) return date.toLocaleTimeString(tag, options);
  // The phone's clock decides: a caller's own hour12 would beat hourCycle.
  const { hour12: _ignored, hourCycle: _alsoIgnored, ...rest } = options;
  void _ignored;
  void _alsoIgnored;
  // A 24-hour clock as h23, never "24:30": `hour12: false` on a tag whose own
  // default is 12-hour resolved to h24 under the older rule (code review, round 2).
  return date.toLocaleTimeString(tag, hour12 ? { ...rest, hour12: true } : { ...rest, hourCycle: 'h23' });
}

/** Test-only: forget the locale read at launch, or set the phone's. */
export function __setDeviceLocaleForTests(tag: string | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setDeviceLocaleForTests is only allowed when NODE_ENV=test');
  }
  cached = tag === null ? null : resolve(tag, tag);
}

/**
 * Test-only: what the phone's 24-Hour Time switch says (true for a 12-hour
 * clock), or null to read it the real way again. Forgets the cached locale.
 */
export function __setPhoneClockForTests(twelveHourClock: boolean | null | undefined): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setPhoneClockForTests is only allowed when NODE_ENV=test');
  }
  readPhoneClock = twelveHourClock === undefined ? phoneTwelveHour : () => twelveHourClock;
  cached = null;
}

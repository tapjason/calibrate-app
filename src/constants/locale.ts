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

interface Resolved {
  /** The tag to format with, or undefined for the phone's own locale. */
  tag: string | undefined;
  /** The phone's clock, when the tag above can't be trusted to carry it. */
  hour12: boolean | undefined;
}

let cached: Resolved | null = null;

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
    const said = new Date(2000, 0, 1, 13).toLocaleTimeString(locale, { hour: 'numeric' });
    return !said.includes('13');
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
  const m = /^([a-z]{2,3})(?:-[a-z]{4})?(?:-([a-z]{2}|\d{3}))?(?:-|$)/i.exec(tag.trim());
  if (!m) return undefined;
  if (m[1].toLowerCase() === 'en') return undefined;
  return m[2] ? `en-${m[2].toUpperCase()}` : 'en';
}

/**
 * What to format with on a phone whose locale is `tag`. `clockFrom` is where
 * the phone's clock is read: the tag in tests, the phone's own default
 * otherwise, which carries the 24-hour switch in Settings.
 */
function resolve(tag: string, clockFrom: string | undefined): Resolved {
  const english = englishFor(tag);
  if (english === undefined) return { tag: undefined, hour12: undefined };
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
  return { tag: candidate, hour12: phoneTwelve === null ? undefined : phoneTwelve };
}

function current(): Resolved {
  if (cached !== null) return cached;
  try {
    cached = resolve(Intl.DateTimeFormat().resolvedOptions().locale, undefined);
  } catch {
    cached = { tag: undefined, hour12: undefined };
  }
  return cached;
}

/** The locale for every date and count the app writes; read once per launch. */
export function dateLocale(): string | undefined {
  return current().tag;
}

/**
 * A time of day ("19:00", "7:00 PM") in English, on the phone's own clock.
 * Use this, never `toLocaleTimeString` directly.
 */
export function localTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  const { tag, hour12 } = current();
  return date.toLocaleTimeString(tag, hour12 === undefined ? options : { ...options, hour12 });
}

/** Test-only: forget the locale read at launch, or set the phone's. */
export function __setDeviceLocaleForTests(tag: string | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setDeviceLocaleForTests is only allowed when NODE_ENV=test');
  }
  cached = tag === null ? null : resolve(tag, tag);
}

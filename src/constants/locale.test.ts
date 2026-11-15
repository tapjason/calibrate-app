import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  __setDeviceLocaleForTests,
  dateLocale,
  deviceRegion,
  englishFor,
  localTime,
  regionOf,
} from './locale';

describe('englishFor', () => {
  it('keeps an English phone on its own locale', () => {
    expect(englishFor('en-US')).toBeUndefined();
    expect(englishFor('en-GB')).toBeUndefined();
    expect(englishFor('en')).toBeUndefined();
  });

  it('writes English in the region of a phone in another language', () => {
    expect(englishFor('pt-BR')).toBe('en-BR');
    expect(englishFor('nl-BE')).toBe('en-BE');
    expect(englishFor('zh-Hant-TW')).toBe('en-TW');
    expect(englishFor('es-419')).toBe('en-419');
  });

  it('falls back to plain English with no region, and to the phone with no tag', () => {
    expect(englishFor('ja')).toBe('en');
    expect(englishFor('')).toBeUndefined();
    expect(englishFor('??')).toBeUndefined();
  });
});

describe('regionOf and deviceRegion', () => {
  afterEach(() => __setDeviceLocaleForTests(null));

  it('reads a two-letter region, whatever the language or script', () => {
    expect(regionOf('en-US')).toBe('US');
    expect(regionOf('en_GB')).toBe('GB');
    expect(regionOf('zh-Hant-TW')).toBe('TW');
    expect(regionOf('pt-br')).toBe('BR');
  });

  it('is null with no region, or one that is not a country', () => {
    expect(regionOf('ja')).toBeNull();
    expect(regionOf('es-419')).toBeNull();
    expect(regionOf('')).toBeNull();
  });

  it("is the phone's, for an English phone too", () => {
    __setDeviceLocaleForTests('en-GB');
    expect(deviceRegion()).toBe('GB');
    __setDeviceLocaleForTests('nl-BE');
    expect(deviceRegion()).toBe('BE');
    __setDeviceLocaleForTests('ja');
    expect(deviceRegion()).toBeNull();
  });
});

describe('dateLocale and localTime', () => {
  afterEach(() => __setDeviceLocaleForTests(null));
  const sunday = new Date(2026, 10, 15, 19, 0);
  const date = () =>
    sunday.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
  const time = () => localTime(sunday, { hour: 'numeric', minute: '2-digit' });

  // Blind playtest 2026-11-14, runs 2 and 5: "Due zondag 15 nov".
  it("gives English names in the phone's order and clock on a Dutch phone", () => {
    __setDeviceLocaleForTests('nl-BE');
    expect(date()).toMatch(/Sunday/);
    expect(date()).toMatch(/15 Nov/);
    expect(date()).not.toMatch(/zondag/);
    expect(time()).toBe('19:00');
  });

  // Code review of step 181: "en-BR" is plain US English to ICU, month first
  // and "7:00 PM", where the phone itself showed "15 de nov." and "19:00".
  // Each keeps its own order and clock: Mexico writes the day first on a
  // 12-hour clock, China the month first on a 24-hour one.
  it.each([
    ['pt-BR', /15 Nov/, /^19:00$/],
    ['es-MX', /15 Nov/, /^7:00\spm$/i],
    ['zh-CN', /Nov 15/, /^19:00$/],
  ])('keeps the order and clock of a %s phone', (tag, order, clock) => {
    __setDeviceLocaleForTests(tag);
    expect(date()).toMatch(/Sunday/);
    expect(date()).toMatch(order);
    expect(time()).toMatch(clock);
  });

  it('leaves a US phone as it was', () => {
    __setDeviceLocaleForTests('en-US');
    expect(dateLocale()).toBeUndefined();
    expect(time()).toMatch(/^7:00\sPM$/);
  });
});

// CLAUDE.md, Visual design: every date, time and count goes through this
// file, so a phone in another language never gets its own words inside an
// English sentence again.
describe('every date and time is written through dateLocale', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const root = join(__dirname, '..', '..');

  it("has no call left on the phone's own locale", () => {
    const offenders = [...files(join(root, 'src')), ...files(join(root, 'app'))].filter((path) => {
      if (path.endsWith(join('constants', 'locale.ts'))) return false;
      const source = readFileSync(path, 'utf8');
      return (
        /toLocale(Date|Time)?String\(\s*(undefined|\[\s*\])?\s*[,)]/.test(source) ||
        /toLocaleTimeString\(/.test(source) ||
        /Intl\.(DateTimeFormat|NumberFormat)\(\s*(undefined)?\s*[,)](?!\.resolvedOptions)/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });
});

// Record audit and code review, round 2.
describe('countLocale and the 24-hour clock', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { countLocale } = require('./locale') as typeof import('./locale');
  /* eslint-enable @typescript-eslint/no-var-requires */
  afterEach(() => __setDeviceLocaleForTests(null));

  it('groups counts in plain English on every phone, an English one in Germany too', () => {
    for (const tag of ['nl-BE', 'de-DE', 'pt-BR', 'ja', 'en-DE', 'en-CH', 'en-GB', 'en-US']) {
      __setDeviceLocaleForTests(tag);
      expect(countLocale()).toBe('en');
      expect(new Intl.NumberFormat(countLocale(), { maximumFractionDigits: 0 }).format(1234)).toBe(
        '1,234',
      );
    }
  });

  it('writes half past midnight with hour 0 on a 24-hour phone, never 24:30', () => {
    const late = new Date(2026, 10, 15, 0, 30);
    for (const tag of ['zh-CN', 'pt-BR', 'nl-BE']) {
      __setDeviceLocaleForTests(tag);
      // "0:30" or "00:30" by the region's habit; the hour is never 24.
      expect(localTime(late, { hour: 'numeric', minute: '2-digit' })).toMatch(/^0?0:30$/);
    }
  });

  // Code review, 2026-11-15: a locale that writes its own digits prints no
  // "13" for 13:00 either way, so the clock is read from the formatter's own
  // word there. Before that, a 24-hour phone in Persian read as 12-hour.
  it("reads the clock of a phone that writes its own digits", () => {
    const evening = new Date(2026, 10, 15, 19, 0);
    const time = (tag: string) => {
      __setDeviceLocaleForTests(tag);
      // Narrow no-break spaces before "PM" read as plain ones here.
      return localTime(evening, { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
    };
    expect(time('fa-IR')).toBe('19:00');
    // "pm" or "PM" by the English the region's order picked.
    expect(time('ar-EG')).toMatch(/^7:00 pm$/i);
  });
});

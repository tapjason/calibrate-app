import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { __setDeviceLocaleForTests, dateLocale, englishFor, localTime } from './locale';

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

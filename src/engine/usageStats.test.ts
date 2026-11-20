import {
  USAGE_STATS_START_OFF_REGIONS,
  usageStatsOffByRegion,
  usageStatsOn,
  usageStatsStartOff,
  type PhoneRegions,
  type UsageStatsSetting,
} from './usageStats';

// The owner's decision, 2026-11-19 (the owner's list, items 8 and 21): on a
// phone whose region is Canada, Usage stats start off and stay off until the
// person turns them on. Everywhere else they start on, as before. The phone is
// in Canada when either its Region setting or its language tag's region says
// so (policy audit of step 203).

const NOT_CHOSEN: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: false };
const CHOSEN_ON: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: true };
const CHOSEN_OFF: UsageStatsSetting = { analyticsEnabled: false, analyticsChosen: true };
/**
 * A record from a build before `analyticsChosen`, read by the store: the
 * switch's stored value, and not chosen.
 */
const OLD_ON: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: false };
const OLD_OFF: UsageStatsSetting = { analyticsEnabled: false, analyticsChosen: false };

/** A phone whose Region setting can't be read: only the language tag's region. */
const tagOnly = (languageRegion: string | null): PhoneRegions => ({ regionSetting: null, languageRegion });
/** Both readings: the Region setting, then the language tag's region. */
const phone = (regionSetting: string | null, languageRegion: string | null): PhoneRegions => ({
  regionSetting,
  languageRegion,
});

describe('usageStatsStartOff', () => {
  it('is Canada only', () => {
    expect([...USAGE_STATS_START_OFF_REGIONS]).toEqual(['CA']);
    expect(usageStatsStartOff(tagOnly('CA'))).toBe(true);
    expect(usageStatsStartOff(tagOnly('ca'))).toBe(true);
    expect(usageStatsStartOff(phone('CA', null))).toBe(true);
    expect(usageStatsStartOff(phone('ca', null))).toBe(true);
    for (const region of ['US', 'GB', 'FR', 'MX', 'PR']) {
      expect(usageStatsStartOff(tagOnly(region))).toBe(false);
      expect(usageStatsStartOff(phone(region, region))).toBe(false);
    }
  });

  // A region that can't be read is treated as not Canada (a call the owner
  // may reverse).
  it('treats a region that can’t be read as not Canada', () => {
    for (const unreadable of [null, '', 'CAN', '419', 42 as unknown as string]) {
      expect(usageStatsStartOff(tagOnly(unreadable))).toBe(false);
      expect(usageStatsStartOff(phone(unreadable, null))).toBe(false);
      expect(usageStatsStartOff(phone(unreadable, unreadable))).toBe(false);
    }
  });

  // Policy audit of step 203: English (UK) on a phone whose Region is Canada
  // can reach the JavaScript engine as "en-GB". Either reading is enough.
  it('is true when either reading is Canada', () => {
    expect(usageStatsStartOff(phone('CA', 'GB'))).toBe(true);
    expect(usageStatsStartOff(phone('US', 'CA'))).toBe(true);
    expect(usageStatsStartOff(phone('CA', 'CA'))).toBe(true);
    expect(usageStatsStartOff(phone('CA', null))).toBe(true);
    expect(usageStatsStartOff(phone('US', 'US'))).toBe(false);
    expect(usageStatsStartOff(phone('US', null))).toBe(false);
    expect(usageStatsStartOff(phone(null, 'GB'))).toBe(false);
  });

  it('falls back to the language tag where the Region setting can’t be read', () => {
    expect(usageStatsStartOff(phone(null, 'CA'))).toBe(true);
    expect(usageStatsStartOff(phone(null, 'US'))).toBe(false);
    expect(usageStatsStartOff(phone('', 'CA'))).toBe(true);
    expect(usageStatsStartOff(phone('001', 'CA'))).toBe(true);
  });
});

describe('usageStatsOn: region × choice', () => {
  it.each<[string, UsageStatsSetting, PhoneRegions, boolean]>([
    // Canada
    ['not chosen, Canada', NOT_CHOSEN, tagOnly('CA'), false],
    ['chosen on, Canada', CHOSEN_ON, tagOnly('CA'), true],
    ['chosen off, Canada', CHOSEN_OFF, tagOnly('CA'), false],
    // Elsewhere
    ['not chosen, elsewhere', NOT_CHOSEN, tagOnly('US'), true],
    ['chosen on, elsewhere', CHOSEN_ON, tagOnly('US'), true],
    ['chosen off, elsewhere', CHOSEN_OFF, tagOnly('US'), false],
    // A region that can't be read: not Canada
    ['not chosen, region unreadable', NOT_CHOSEN, tagOnly(null), true],
    ['chosen on, region unreadable', CHOSEN_ON, tagOnly(null), true],
    ['chosen off, region unreadable', CHOSEN_OFF, tagOnly(null), false],
  ])('%s', (_label, setting, regions, on) => {
    expect(usageStatsOn(setting, regions)).toBe(on);
  });

  // The two readings: Canada by either one starts off, and a choice holds
  // across all of them.
  it.each<[string, PhoneRegions, boolean]>([
    ['Region Canada, language en-GB', phone('CA', 'GB'), false],
    ['Region US, language en-CA', phone('US', 'CA'), false],
    ['Region US, language en-US', phone('US', 'US'), true],
    ['Region unreadable, language en-CA', phone(null, 'CA'), false],
    ['Region unreadable, language en-US', phone(null, 'US'), true],
    ['Region Canada, language names no region', phone('CA', null), false],
    ['neither readable', phone(null, null), true],
  ])('not chosen: %s', (_label, regions, on) => {
    expect(usageStatsOn(NOT_CHOSEN, regions)).toBe(on);
    expect(usageStatsOn(OLD_ON, regions)).toBe(on);
    expect(usageStatsOn(CHOSEN_ON, regions)).toBe(true);
    expect(usageStatsOn(CHOSEN_OFF, regions)).toBe(false);
    expect(usageStatsOn(OLD_OFF, regions)).toBe(false);
  });

  // A record from before the choice was stored: a stored on is not chosen;
  // a stored off stays off everywhere (it was the person's own off, or the
  // private side of a record that couldn't be read).
  it.each<[string, UsageStatsSetting, PhoneRegions, boolean]>([
    ['old record on, Canada', OLD_ON, tagOnly('CA'), false],
    ['old record on, elsewhere', OLD_ON, tagOnly('US'), true],
    ['old record on, region unreadable', OLD_ON, tagOnly(null), true],
    ['old record off, Canada', OLD_OFF, tagOnly('CA'), false],
    ['old record off, elsewhere', OLD_OFF, tagOnly('US'), false],
    ['old record off, region unreadable', OLD_OFF, tagOnly(null), false],
  ])('%s', (_label, setting, regions, on) => {
    expect(usageStatsOn(setting, regions)).toBe(on);
  });

  it('follows the region while nothing is chosen, and the choice once made', () => {
    // Before any choice: the region decides, each time it is read.
    expect(usageStatsOn(NOT_CHOSEN, tagOnly('US'))).toBe(true);
    expect(usageStatsOn(NOT_CHOSEN, tagOnly('CA'))).toBe(false);
    expect(usageStatsOn(NOT_CHOSEN, tagOnly('US'))).toBe(true);
    expect(usageStatsOn(NOT_CHOSEN, phone('CA', 'GB'))).toBe(false);
    // Once chosen, whatever the region becomes.
    for (const regions of [tagOnly('US'), tagOnly('CA'), tagOnly(null), phone('CA', 'GB'), phone('US', 'CA')]) {
      expect(usageStatsOn(CHOSEN_ON, regions)).toBe(true);
      expect(usageStatsOn(CHOSEN_OFF, regions)).toBe(false);
    }
  });

  it('reads anything but a stored true as off', () => {
    const odd = { analyticsEnabled: 'true', analyticsChosen: true } as unknown as UsageStatsSetting;
    expect(usageStatsOn(odd, tagOnly('US'))).toBe(false);
  });
});

describe('usageStatsOffByRegion', () => {
  it('is true only for a stored on, never chosen, in Canada', () => {
    expect(usageStatsOffByRegion(NOT_CHOSEN, tagOnly('CA'))).toBe(true);
    expect(usageStatsOffByRegion(NOT_CHOSEN, tagOnly('US'))).toBe(false);
    expect(usageStatsOffByRegion(NOT_CHOSEN, tagOnly(null))).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_ON, tagOnly('CA'))).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_OFF, tagOnly('CA'))).toBe(false);
    // A stored off is off by the person's choice or a record that couldn't be
    // read, not by the region.
    expect(usageStatsOffByRegion(OLD_OFF, tagOnly('CA'))).toBe(false);
  });

  it('is true when either reading is Canada, and only then', () => {
    expect(usageStatsOffByRegion(NOT_CHOSEN, phone('CA', 'GB'))).toBe(true);
    expect(usageStatsOffByRegion(NOT_CHOSEN, phone('US', 'CA'))).toBe(true);
    expect(usageStatsOffByRegion(NOT_CHOSEN, phone(null, 'CA'))).toBe(true);
    expect(usageStatsOffByRegion(NOT_CHOSEN, phone('US', 'US'))).toBe(false);
    expect(usageStatsOffByRegion(NOT_CHOSEN, phone(null, 'US'))).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_ON, phone('CA', 'GB'))).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_OFF, phone('CA', 'GB'))).toBe(false);
  });
});

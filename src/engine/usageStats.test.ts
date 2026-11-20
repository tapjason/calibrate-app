import {
  USAGE_STATS_START_OFF_REGIONS,
  usageStatsOffByRegion,
  usageStatsOn,
  usageStatsStartOff,
  type UsageStatsSetting,
} from './usageStats';

// The owner's decision, 2026-11-19 (the owner's list, items 8 and 21): on a
// phone whose region is Canada, Usage stats start off and stay off until the
// person turns them on. Everywhere else they start on, as before.

const NOT_CHOSEN: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: false };
const CHOSEN_ON: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: true };
const CHOSEN_OFF: UsageStatsSetting = { analyticsEnabled: false, analyticsChosen: true };
/**
 * A record from a build before `analyticsChosen`, read by the store: the
 * switch's stored value, and not chosen.
 */
const OLD_ON: UsageStatsSetting = { analyticsEnabled: true, analyticsChosen: false };
const OLD_OFF: UsageStatsSetting = { analyticsEnabled: false, analyticsChosen: false };

describe('usageStatsStartOff', () => {
  it('is Canada only', () => {
    expect([...USAGE_STATS_START_OFF_REGIONS]).toEqual(['CA']);
    expect(usageStatsStartOff('CA')).toBe(true);
    expect(usageStatsStartOff('ca')).toBe(true);
    for (const region of ['US', 'GB', 'FR', 'MX', 'PR']) {
      expect(usageStatsStartOff(region)).toBe(false);
    }
  });

  // A region that can't be read is treated as not Canada (a call the owner
  // may reverse).
  it('treats a region that can’t be read as not Canada', () => {
    expect(usageStatsStartOff(null)).toBe(false);
    expect(usageStatsStartOff('')).toBe(false);
    expect(usageStatsStartOff('CAN')).toBe(false);
    expect(usageStatsStartOff('419')).toBe(false);
    expect(usageStatsStartOff(42 as unknown as string)).toBe(false);
  });
});

describe('usageStatsOn: region × choice', () => {
  it.each<[string, UsageStatsSetting, string | null, boolean]>([
    // Canada
    ['not chosen, Canada', NOT_CHOSEN, 'CA', false],
    ['chosen on, Canada', CHOSEN_ON, 'CA', true],
    ['chosen off, Canada', CHOSEN_OFF, 'CA', false],
    // Elsewhere
    ['not chosen, elsewhere', NOT_CHOSEN, 'US', true],
    ['chosen on, elsewhere', CHOSEN_ON, 'US', true],
    ['chosen off, elsewhere', CHOSEN_OFF, 'US', false],
    // A region that can't be read: not Canada
    ['not chosen, region unreadable', NOT_CHOSEN, null, true],
    ['chosen on, region unreadable', CHOSEN_ON, null, true],
    ['chosen off, region unreadable', CHOSEN_OFF, null, false],
  ])('%s', (_label, setting, region, on) => {
    expect(usageStatsOn(setting, region)).toBe(on);
  });

  // A record from before the choice was stored: a stored on is not chosen;
  // a stored off stays off everywhere (it was the person's own off, or the
  // private side of a record that couldn't be read).
  it.each<[string, UsageStatsSetting, string | null, boolean]>([
    ['old record on, Canada', OLD_ON, 'CA', false],
    ['old record on, elsewhere', OLD_ON, 'US', true],
    ['old record on, region unreadable', OLD_ON, null, true],
    ['old record off, Canada', OLD_OFF, 'CA', false],
    ['old record off, elsewhere', OLD_OFF, 'US', false],
    ['old record off, region unreadable', OLD_OFF, null, false],
  ])('%s', (_label, setting, region, on) => {
    expect(usageStatsOn(setting, region)).toBe(on);
  });

  it('follows the region while nothing is chosen, and the choice once made', () => {
    // Before any choice: the region decides, each time it is read.
    expect(usageStatsOn(NOT_CHOSEN, 'US')).toBe(true);
    expect(usageStatsOn(NOT_CHOSEN, 'CA')).toBe(false);
    expect(usageStatsOn(NOT_CHOSEN, 'US')).toBe(true);
    // Once chosen, whatever the region becomes.
    for (const region of ['US', 'CA', null]) {
      expect(usageStatsOn(CHOSEN_ON, region)).toBe(true);
      expect(usageStatsOn(CHOSEN_OFF, region)).toBe(false);
    }
  });

  it('reads anything but a stored true as off', () => {
    const odd = { analyticsEnabled: 'true', analyticsChosen: true } as unknown as UsageStatsSetting;
    expect(usageStatsOn(odd, 'US')).toBe(false);
  });
});

describe('usageStatsOffByRegion', () => {
  it('is true only for a stored on, never chosen, in Canada', () => {
    expect(usageStatsOffByRegion(NOT_CHOSEN, 'CA')).toBe(true);
    expect(usageStatsOffByRegion(NOT_CHOSEN, 'US')).toBe(false);
    expect(usageStatsOffByRegion(NOT_CHOSEN, null)).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_ON, 'CA')).toBe(false);
    expect(usageStatsOffByRegion(CHOSEN_OFF, 'CA')).toBe(false);
    // A stored off is off by the person's choice or a record that couldn't be
    // read, not by the region.
    expect(usageStatsOffByRegion(OLD_OFF, 'CA')).toBe(false);
  });
});

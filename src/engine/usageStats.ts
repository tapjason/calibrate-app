// Whether Usage stats are on (the owner's decision, 2026-11-19; the owner's
// list, items 8 and 21): on a phone whose region is Canada they start off and
// stay off until the person turns them on, since Quebec's privacy law asks for
// the most private setting by default. Everywhere else they start on, as
// before.
//
// The setting is two stored values (src/store/settingsStore.ts):
//   analyticsEnabled  the switch's value as stored. It starts true and stays
//                     true until the person turns the switch off, or until the
//                     store holds its private side for a record it couldn't
//                     read.
//   analyticsChosen   whether the person has set the switch themselves, on
//                     the Warm-up's first screen, in You or on the sign-in
//                     screen. A record from before this existed has none: not
//                     chosen.
//
// Read as:
//   - stored off: off, in every region and whether chosen or not. Off was the
//     person's choice (a record from an earlier build had no other way to
//     store it) or the private side of a record that couldn't be read; either
//     way it is never read as on.
//   - stored on and chosen: on, whatever the region is or later becomes.
//   - stored on, not chosen: off where the region starts it off (Canada), on
//     everywhere else. Worked out on every read, so a phone whose region
//     changes before any choice follows its region.
//
// A region that can't be read (null) is treated as not Canada, so the switch
// starts on there as before. That is a call the owner may want to reverse:
// it would take `null` into `usageStatsStartOff` below.
//
// Layer rule: L3. Pure: the region is passed in, never read here.

/** The Usage stats setting as the settings store holds it. */
export interface UsageStatsSetting {
  /** The switch's stored value. */
  analyticsEnabled: boolean;
  /** Whether the person has set the switch themselves. */
  analyticsChosen: boolean;
}

/**
 * The regions where Usage stats start off (owner, 2026-11-19): Canada. Two
 * letters, as the phone's locale names them ("CA").
 */
export const USAGE_STATS_START_OFF_REGIONS: ReadonlySet<string> = new Set(['CA']);

/**
 * Whether Usage stats start off in `region` until the person turns them on.
 * A region that can't be read (null, or not two letters) is not Canada: false.
 */
export function usageStatsStartOff(region: string | null): boolean {
  if (typeof region !== 'string' || !/^[a-z]{2}$/i.test(region)) return false;
  return USAGE_STATS_START_OFF_REGIONS.has(region.toUpperCase());
}

/**
 * Whether Usage stats are on, for the stored `setting` on a phone in `region`
 * (the rules at the top of this file).
 */
export function usageStatsOn(setting: UsageStatsSetting, region: string | null): boolean {
  if (setting.analyticsEnabled !== true) return false;
  if (setting.analyticsChosen === true) return true;
  return !usageStatsStartOff(region);
}

/**
 * Whether Usage stats are off only because the region starts them off: stored
 * on, never chosen, in Canada. The store clears the queued counts then
 * (`settingsStore.hydrate`), as turning the switch off does: counts queued
 * while the phone's region was elsewhere and Usage stats were on by default
 * never go up, even after the person turns them on.
 */
export function usageStatsOffByRegion(setting: UsageStatsSetting, region: string | null): boolean {
  return (
    setting.analyticsEnabled === true &&
    setting.analyticsChosen !== true &&
    usageStatsStartOff(region)
  );
}

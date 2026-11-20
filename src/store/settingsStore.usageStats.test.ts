// Usage stats off by default on a phone whose region is Canada (the owner's
// decision, 2026-11-19; the owner's list, items 8 and 21): the stored choice,
// the one read of the setting, and the queue on a phone that becomes off by
// default. The rules themselves are tested in src/engine/usageStats.test.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { __setDeviceLocaleForTests, __setPhoneRegionForTests } from '@/constants/locale';
import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';

import {
  __setPersistenceForTests,
  selectUsageStatsOn,
  usageStatsStartOffHere,
  useSettingsStore,
  type SettingsPersistence,
  type StoredSettings,
} from './settingsStore';

/** A settings record in memory: what it holds, and every write in order. */
function makeRecord(
  initial: Partial<StoredSettings> | null,
  options: { loadThrows?: () => boolean } = {},
): { persistence: SettingsPersistence; saved: StoredSettings[]; current: () => Partial<StoredSettings> | null } {
  let stored = initial;
  const saved: StoredSettings[] = [];
  return {
    saved,
    current: () => stored,
    persistence: {
      async load() {
        if (options.loadThrows?.()) throw new Error('read failed');
        return stored;
      },
      async save(s) {
        saved.push(s);
        stored = s;
      },
    },
  };
}

/**
 * The phone's region: its language tag ("en-CA" is Canada; "en" names none)
 * and its Region setting ("CA"), null where that can't be read (web, a build
 * without expo-localization), which is the default here.
 */
function phoneIn(tag: 'en-CA' | 'fr-CA' | 'en-US' | 'en-GB' | 'en', regionSetting: string | null = null): void {
  __setDeviceLocaleForTests(tag);
  __setPhoneRegionForTests(regionSetting);
}

const on = (): boolean => selectUsageStatsOn(useSettingsStore.getState());

async function queue(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await enqueueEvent({
      id: `queued-${i}`,
      user_id: 'user-1',
      name: 'share_completed',
      props: { surface: 'card' },
      created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    });
  }
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  __setPersistenceForTests(null);
  __setDeviceLocaleForTests(null);
  __setPhoneRegionForTests(undefined);
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('Usage stats: the effective value after hydrate', () => {
  it.each<[string, Parameters<typeof phoneIn>[0], Partial<StoredSettings> | null, boolean]>([
    // A fresh install: nothing stored, nothing chosen.
    ['fresh install, Canada', 'en-CA', null, false],
    ['fresh install, Canada in French', 'fr-CA', null, false],
    ['fresh install, elsewhere', 'en-US', null, true],
    ['fresh install, region unreadable', 'en', null, true],
    // Chosen on.
    ['chosen on, Canada', 'en-CA', { analyticsEnabled: true, analyticsChosen: true }, true],
    ['chosen on, elsewhere', 'en-GB', { analyticsEnabled: true, analyticsChosen: true }, true],
    ['chosen on, region unreadable', 'en', { analyticsEnabled: true, analyticsChosen: true }, true],
    // Chosen off.
    ['chosen off, Canada', 'en-CA', { analyticsEnabled: false, analyticsChosen: true }, false],
    ['chosen off, elsewhere', 'en-US', { analyticsEnabled: false, analyticsChosen: true }, false],
    ['chosen off, region unreadable', 'en', { analyticsEnabled: false, analyticsChosen: true }, false],
    // A record from an earlier build: no analyticsChosen at all.
    ['old record on, Canada', 'en-CA', { analyticsEnabled: true }, false],
    ['old record on, elsewhere', 'en-US', { analyticsEnabled: true }, true],
    ['old record on, region unreadable', 'en', { analyticsEnabled: true }, true],
    ['old record off, Canada', 'en-CA', { analyticsEnabled: false }, false],
    ['old record off, elsewhere', 'en-US', { analyticsEnabled: false }, false],
    ['old record off, region unreadable', 'en', { analyticsEnabled: false }, false],
    // Anything but true for the choice is not a choice.
    ['a choice that isn’t true, Canada', 'en-CA', { analyticsEnabled: true, analyticsChosen: 'yes' as unknown as boolean }, false],
  ])('%s', async (_label, tag, record, expected) => {
    phoneIn(tag);
    __setPersistenceForTests(makeRecord(record).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(expected);
  });

  it('says whether this phone starts them off', () => {
    phoneIn('en-CA');
    expect(usageStatsStartOffHere()).toBe(true);
    phoneIn('en-US');
    expect(usageStatsStartOffHere()).toBe(false);
    phoneIn('en');
    expect(usageStatsStartOffHere()).toBe(false);
  });

  // Before the record is read, the defaults: nothing chosen, so a Canadian
  // phone reads off from the first moment of a launch.
  it('reads off on a Canadian phone before the record is read', () => {
    phoneIn('en-CA');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true, analyticsChosen: true }).persistence);
    expect(useSettingsStore.getState().hydrated).toBe(false);
    expect(on()).toBe(false);
  });
});

describe('Usage stats: a region change', () => {
  it('follows the region while nothing is chosen', async () => {
    phoneIn('en-US');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(true);

    phoneIn('en-CA');
    expect(on()).toBe(false);

    phoneIn('en-US');
    expect(on()).toBe(true);
  });

  it('keeps the choice once made, whatever the region becomes', async () => {
    phoneIn('en-CA');
    const record = makeRecord(null);
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(false);

    // Turned on in Canada.
    await useSettingsStore.getState().setAnalyticsEnabled(true);
    expect(on()).toBe(true);
    phoneIn('en-US');
    expect(on()).toBe(true);
    phoneIn('en-CA');
    expect(on()).toBe(true);

    // Turned off elsewhere, then the phone moves to Canada and back.
    phoneIn('en-US');
    await useSettingsStore.getState().setAnalyticsEnabled(false);
    expect(on()).toBe(false);
    phoneIn('en-CA');
    expect(on()).toBe(false);
    phoneIn('en-US');
    expect(on()).toBe(false);
  });

  it('keeps the choice across a relaunch in another region', async () => {
    phoneIn('en-CA');
    const record = makeRecord(null);
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();
    await useSettingsStore.getState().setAnalyticsEnabled(true);

    // The next launch, the phone's region now elsewhere, then Canada again.
    const stored = record.current();
    phoneIn('en-US');
    __setPersistenceForTests(makeRecord(stored).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(true);
    phoneIn('en-CA');
    __setPersistenceForTests(makeRecord(stored).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(true);
  });
});

// Policy audit of step 203: the language tag's region is not the Region
// setting. English (UK) on a phone whose Region is Canada can reach the
// JavaScript engine as "en-GB", which read as Britain and started Usage stats
// on. The phone is in Canada when either reading says so; where the Region
// setting can't be read, the tag decides.
describe('Usage stats: the Region setting and the language tag', () => {
  type Tag = Parameters<typeof phoneIn>[0];

  it.each<[string, Tag, string | null, boolean]>([
    ['language en-GB, Region Canada', 'en-GB', 'CA', false],
    ['language en-CA, Region US', 'en-CA', 'US', false],
    ['language en-US, Region US', 'en-US', 'US', true],
    ['language en (no region), Region Canada', 'en', 'CA', false],
    ['language en-GB, Region GB', 'en-GB', 'GB', true],
    ['language en-CA, Region unreadable', 'en-CA', null, false],
    ['language en-US, Region unreadable', 'en-US', null, true],
    ['language en (no region), Region unreadable', 'en', null, true],
  ])('a fresh install, %s', async (_label, tag, regionSetting, expected) => {
    phoneIn(tag, regionSetting);
    __setPersistenceForTests(makeRecord(null).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(expected);
    // The Warm-up's line goes by the same readings.
    expect(usageStatsStartOffHere()).toBe(!expected);
  });

  it('keeps a choice once made, on every pair of readings', async () => {
    const pairs: Array<[Tag, string | null]> = [
      ['en-GB', 'CA'],
      ['en-CA', 'US'],
      ['en-US', 'US'],
      ['en-CA', null],
      ['en-US', null],
      ['en', null],
    ];
    for (const value of [true, false]) {
      for (const [tag, regionSetting] of pairs) {
        phoneIn(tag, regionSetting);
        __setPersistenceForTests(makeRecord({ analyticsEnabled: value, analyticsChosen: true }).persistence);
        await useSettingsStore.getState().hydrate();
        expect(on()).toBe(value);
      }
    }
  });

  it('follows a change of the Region setting while nothing is chosen, and the choice once made', async () => {
    phoneIn('en-GB', 'GB');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(true);

    // The Region set to Canada, the language left as English (UK).
    phoneIn('en-GB', 'CA');
    expect(on()).toBe(false);

    await useSettingsStore.getState().setAnalyticsEnabled(true);
    for (const [tag, regionSetting] of [['en-GB', 'GB'], ['en-GB', 'CA'], ['en-CA', 'US']] as const) {
      phoneIn(tag, regionSetting);
      expect(on()).toBe(true);
    }
  });

  it('clears what was queued at launch on a phone in English (UK) with its Region set to Canada', async () => {
    await queue(3);
    phoneIn('en-GB', 'CA');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(false);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('clears it once a record that couldn’t be read reads, on the same phone', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await queue(2);
    phoneIn('en-GB', 'CA');
    let failing = true;
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }, { loadThrows: () => failing }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    failing = false;
    await useSettingsStore.getState().retryLoad();
    expect(useSettingsStore.getState().loadFailed).toBe(false);
    expect(on()).toBe(false);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('keeps the queue on a phone in US English with its Region set to the US', async () => {
    await queue(2);
    phoneIn('en-US', 'US');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(true);
    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });
});

describe('Usage stats: what is stored', () => {
  it('leaves the choice out of a record until one is made, as earlier builds wrote it', async () => {
    phoneIn('en-CA');
    const record = makeRecord(null);
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();

    await useSettingsStore.getState().setStreakShown(false);
    expect(record.saved.at(-1)).toMatchObject({ analyticsEnabled: true });
    expect(record.saved.at(-1)).not.toHaveProperty('analyticsChosen');
  });

  it.each([true, false])('stores the choice from the switch (%s)', async (value) => {
    phoneIn('en-CA');
    const record = makeRecord(null);
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();

    await useSettingsStore.getState().setAnalyticsEnabled(value);
    expect(useSettingsStore.getState().analyticsChosen).toBe(true);
    expect(record.saved.at(-1)).toMatchObject({ analyticsEnabled: value, analyticsChosen: true });
  });

  // Erase, sign-out and account deletion keep the settings. Erase's writes
  // (the card choices, the streak moment, then the usage line's,
  // `forgetUsageNoticeShown`, the one it reports) each store the whole
  // record, the choice included.
  it('keeps the choice through Erase’s write of the record', async () => {
    phoneIn('en-CA');
    const record = makeRecord({ analyticsEnabled: true, analyticsChosen: true });
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();

    await useSettingsStore.getState().setCardHiddenCategories([]);
    await useSettingsStore.getState().setStreakMomentDay(null);
    await expect(useSettingsStore.getState().forgetUsageNoticeShown()).resolves.toBe(true);
    expect(record.saved.at(-1)).toMatchObject({ analyticsEnabled: true, analyticsChosen: true });
    expect(on()).toBe(true);
  });

  // A record that can't be read: usage stats take their private side, off in
  // every region, and a record replaced by the person's change of another
  // setting stores that off, with no choice, so it stays off until the person
  // turns them on.
  it('reads off in every region while the record can’t be read, and stores that off when replaced', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    phoneIn('en-US');
    const record = makeRecord({ analyticsEnabled: true, analyticsChosen: true }, { loadThrows: () => true });
    __setPersistenceForTests(record.persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    expect(on()).toBe(false);

    await useSettingsStore.getState().setStreakShown(false);
    expect(useSettingsStore.getState().loadFailed).toBe(false);
    const replaced = record.saved.at(-1)!;
    expect(replaced).toMatchObject({ analyticsEnabled: false });
    expect(replaced).not.toHaveProperty('analyticsChosen');

    // The next launch reads it: off, here and in Canada.
    __setPersistenceForTests(makeRecord(replaced).persistence);
    await useSettingsStore.getState().hydrate();
    expect(on()).toBe(false);
    phoneIn('en-CA');
    expect(on()).toBe(false);
  });
});

// Point 3 of the brief: a phone that was on by default and then has its
// region set to Canada keeps no queue that could go up later.
describe('Usage stats: the queue on a phone that becomes off by default', () => {
  it('clears what was queued when the record reads unchosen in Canada', async () => {
    await queue(3);
    phoneIn('en-CA');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    await expect(countUnsyncedEvents()).resolves.toBe(0);

    // And turning them on afterwards finds nothing from before.
    await useSettingsStore.getState().setAnalyticsEnabled(true);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('keeps the queue elsewhere, and in Canada once chosen on', async () => {
    await queue(2);
    phoneIn('en-US');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }).persistence);
    await useSettingsStore.getState().hydrate();
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    phoneIn('en-CA');
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true, analyticsChosen: true }).persistence);
    await useSettingsStore.getState().hydrate();
    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });

  // Off as a guess, while the record can't be read: nothing is deleted, as
  // before (nobody asked for it), and nothing is sent.
  it('keeps the queue while the record can’t be read, and clears it once it reads unchosen in Canada', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await queue(2);
    phoneIn('en-CA');
    let failing = true;
    __setPersistenceForTests(makeRecord({ analyticsEnabled: true }, { loadThrows: () => failing }).persistence);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    failing = false;
    await useSettingsStore.getState().retryLoad();
    expect(useSettingsStore.getState().loadFailed).toBe(false);
    expect(on()).toBe(false);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });
});

// Every reader goes through `selectUsageStatsOn`: a raw read of
// `analyticsEnabled` would turn a Canadian phone's unchosen on back into on.
describe('Usage stats: the one read', () => {
  const ROOT = join(__dirname, '..', '..');

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it('reads analyticsEnabled only in the settings store and the engine’s rule', () => {
    const allowed = new Set(['src/store/settingsStore.ts', 'src/engine/usageStats.ts']);
    const readers = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))]
      .map((file) => relative(ROOT, file).split(sep).join('/'))
      .filter((file) => !allowed.has(file))
      .filter((file) => /\banalyticsEnabled\b/.test(readFileSync(join(ROOT, file), 'utf8')));
    expect(readers).toEqual([]);
  });
});

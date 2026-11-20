// Usage counts on a phone whose region is Canada (the owner's decision,
// 2026-11-19; the owner's list, items 8 and 21): until the person turns Usage
// stats on, nothing is queued and nothing is sent; afterwards counts go up as
// anywhere else (a guest's once the Warm-up's line has been shown too). And a
// phone that was on by default before its region became Canada keeps no queue
// that could go up later.

import type { SupabaseClient } from '@supabase/supabase-js';

import { __setDeviceLocaleForTests, __setPhoneRegionForTests } from '@/constants/locale';
import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
  type StoredSettings,
} from '@/store/settingsStore';

import { flushEvents } from './flush';
import { track } from './track';

const USER = 'user-1';

/** A client recording the ids of each insert. */
function recordingClient(): { client: SupabaseClient; sent: string[] } {
  const sent: string[] = [];
  const client = {
    from: () => ({
      insert: async (rows: Array<{ id: string }>) => {
        sent.push(...rows.map((r) => r.id));
        return { error: null, status: 201 };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, sent };
}

/**
 * Launch with this settings record on a phone whose locale is `tag` and whose
 * Region setting is `regionSetting` (null: can't be read, as on a build
 * without expo-localization).
 */
async function launch(
  tag: string,
  record: Partial<StoredSettings> | null,
  regionSetting: string | null = null,
): Promise<void> {
  __setDeviceLocaleForTests(tag);
  __setPhoneRegionForTests(regionSetting);
  let stored = record;
  __setPersistenceForTests({
    load: async () => stored,
    save: async (s) => {
      stored = s;
    },
  });
  await useSettingsStore.getState().hydrate();
}

/** Turn the switch, as any of the three switches does, once enabled. */
async function turnUsageStats(on: boolean): Promise<void> {
  await useSettingsStore.getState().setAnalyticsEnabled(on);
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetAgeStoreForTests();
  useAuthStore.setState({ userId: USER, email: null, status: 'authenticated' });
});

afterEach(() => {
  __setPersistenceForTests(null);
  __setDeviceLocaleForTests(null);
  __setPhoneRegionForTests(undefined);
  __resetAgeStoreForTests();
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('usage counts on a Canadian phone that hasn’t chosen', () => {
  it('queues nothing and sends nothing', async () => {
    await launch('en-CA', null);

    await track('share_completed', { surface: 'card' });
    await track('prediction_logged', { confidence: 70 });
    await expect(countUnsyncedEvents()).resolves.toBe(0);

    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);
  });

  it('counts go up once the person turns Usage stats on', async () => {
    await launch('en-CA', null);
    await turnUsageStats(true);

    await track('share_completed', { surface: 'card' });
    await expect(countUnsyncedEvents()).resolves.toBe(1);

    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(1);
    expect(sent).toHaveLength(1);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  // A guest: the switch on, and the Warm-up's line shown, both.
  it('a guest’s counts go up only once the switch is on and the line has been shown', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
    await launch('en-CA', null);

    // The line shown first (the stamp is written on a Canadian phone too):
    // still nothing, since the switch is off.
    await useSettingsStore.getState().markUsageNoticeShown();
    await track('warmup_started');
    await expect(countUnsyncedEvents()).resolves.toBe(0);
    const first = recordingClient();
    await expect(flushEvents(LOCAL_GUEST_USER_ID, { client: first.client })).resolves.toBe(0);
    expect(first.sent).toEqual([]);

    await turnUsageStats(true);
    await track('warmup_started');
    const second = recordingClient();
    await expect(flushEvents(LOCAL_GUEST_USER_ID, { client: second.client })).resolves.toBe(1);
    expect(second.sent).toHaveLength(1);
  });

  it('a guest who turned the switch on still waits for the line', async () => {
    useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
    await launch('en-CA', null);
    await turnUsageStats(true);
    await track('warmup_started');
    await expect(countUnsyncedEvents()).resolves.toBe(1);

    const { client, sent } = recordingClient();
    await expect(flushEvents(LOCAL_GUEST_USER_ID, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);

    await useSettingsStore.getState().markUsageNoticeShown();
    await expect(flushEvents(LOCAL_GUEST_USER_ID, { client })).resolves.toBe(1);
  });

  it('elsewhere, nothing changes: counts are queued and sent with no choice made', async () => {
    await launch('en-US', null);
    await track('share_completed', { surface: 'card' });
    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(1);
    expect(sent).toHaveLength(1);
  });
});

// Policy audit of step 203: English (UK) on a phone whose Region setting is
// Canada can reach the JavaScript engine as "en-GB". Canada by either reading
// is Canada.
describe('usage counts by the Region setting as well as the language', () => {
  it('queue nothing and send nothing in English (UK) with the Region set to Canada', async () => {
    await launch('en-GB', null, 'CA');

    await track('share_completed', { surface: 'card' });
    await track('prediction_logged', { confidence: 70 });
    await expect(countUnsyncedEvents()).resolves.toBe(0);

    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);

    // Turned on, counts go up as anywhere else.
    await turnUsageStats(true);
    await track('share_completed', { surface: 'card' });
    await expect(flushEvents(USER, { client })).resolves.toBe(1);
  });

  it('queue nothing in Canadian English with the Region set to the US', async () => {
    await launch('en-CA', null, 'US');
    await track('share_completed', { surface: 'card' });
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('are queued and sent in US English with the Region set to the US', async () => {
    await launch('en-US', null, 'US');
    await track('share_completed', { surface: 'card' });
    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(1);
    expect(sent).toHaveLength(1);
  });

  it('queued before the Region was set to Canada are cleared at the next launch, the language unchanged', async () => {
    await launch('en-GB', null, 'GB');
    await track('share_completed', { surface: 'card' });
    await track('prediction_logged', { confidence: 60 });
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    await launch('en-GB', { analyticsEnabled: true }, 'CA');
    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });
});

describe('counts queued before the phone’s region became Canada', () => {
  it('are never sent: cleared at the launch that finds the phone in Canada', async () => {
    // On by default in the US, with counts waiting (offline, say).
    await launch('en-US', null);
    await track('share_completed', { surface: 'card' });
    await track('prediction_logged', { confidence: 60 });
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    // The region is set to Canada; the next launch reads the same record.
    const record: Partial<StoredSettings> = { analyticsEnabled: true };
    await launch('en-CA', record);
    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);
    await expect(countUnsyncedEvents()).resolves.toBe(0);

    // Turned on afterwards: only what is recorded from then goes up.
    await turnUsageStats(true);
    await track('share_opened');
    await expect(flushEvents(USER, { client })).resolves.toBe(1);
    expect(sent).toHaveLength(1);
  });

  // Before the settings are read at that launch (a flush started by Apple's
  // age answer, say), the defaults hold: nothing chosen, so off in Canada.
  it('are not sent by a flush before the settings are read', async () => {
    await enqueueEvent({
      id: 'from-before',
      user_id: USER,
      name: 'share_completed',
      props: { surface: 'card' },
      created_at: new Date(1_700_000_000_000).toISOString(),
    });
    __setDeviceLocaleForTests('en-CA');
    __setPersistenceForTests({ load: async () => ({ analyticsEnabled: true }), save: async () => {} });
    expect(useSettingsStore.getState().hydrated).toBe(false);

    const { client, sent } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    expect(sent).toEqual([]);
  });
});

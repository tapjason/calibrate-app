// Entering and leaving the under-13 rule (roadmap D70, 2026-11-19): the
// housekeeping src/age/localOnly.ts does around the moments the rule changes.
// The steps it calls are mocked; what is checked is that each runs when it
// should, once, and that nothing it does can throw into the root layout.

jest.mock('@/db/analytics', () => ({
  ...jest.requireActual('@/db/analytics'),
  clearEvents: jest.fn(async () => {}),
}));
jest.mock('@/analytics/flush', () => ({ flushEvents: jest.fn(async () => 0) }));
jest.mock('@/billing/init', () => ({ ensureBillingStarted: jest.fn(async () => true) }));
jest.mock('@/supabase/auth', () => ({
  ...jest.requireActual('@/supabase/auth'),
  pauseSessionRefresh: jest.fn(async () => {}),
  resumeSessionRefresh: jest.fn(async () => {}),
}));
jest.mock('@/store/authStore', () => ({
  ...jest.requireActual('@/store/authStore'),
  syncForUser: jest.fn(async () => ({ pulled: 0, pushed: 0 })),
}));

import { flushEvents } from '@/analytics/flush';
import { ensureBillingStarted } from '@/billing/init';
import { clearEvents } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { syncForUser, useAuthStore } from '@/store/authStore';
import { useCoachStore } from '@/store/coachStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { pauseSessionRefresh, resumeSessionRefresh } from '@/supabase/auth';

import { __resetLocalOnlyForTests, initLocalOnly } from './localOnly';

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const TEEN = { lowerBound: 13, upperBound: 15 };
const SHOWN = '2026-11-19T09:00:00.000Z';

const clear = clearEvents as jest.Mock;
const flush = flushEvents as jest.Mock;
const billing = ensureBillingStarted as jest.Mock;
const pause = pauseSessionRefresh as jest.Mock;
const resume = resumeSessionRefresh as jest.Mock;
const sync = syncForUser as jest.Mock;

let coachReset: jest.Mock;
const originalCoachReset = useCoachStore.getState().reset;
let saved: Array<Record<string, unknown>>;

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

/** Settings as a launch reads them: the usage line already shown on this phone. */
async function hydrateSettings(): Promise<void> {
  await useSettingsStore.getState().hydrate();
}

beforeEach(async () => {
  jest.clearAllMocks();
  setDbForTests(await createTestDb());
  __resetAgeStoreForTests();
  __resetLocalOnlyForTests();
  saved = [];
  __setPersistenceForTests({
    load: async () => ({ usageNoticeShownAt: SHOWN }),
    save: async (s) => {
      saved.push({ ...s });
    },
  });
  coachReset = jest.fn();
  useCoachStore.setState({ reset: coachReset });
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, email: null, status: 'guest' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetLocalOnlyForTests();
  __resetAgeStoreForTests();
  __setPersistenceForTests(null);
  useCoachStore.setState({ reset: originalCoachReset });
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('entering the rule', () => {
  it('at launch, when a stored under-13 band already applies', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: true });
    await hydrateSettings();

    initLocalOnly();
    await settle();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(coachReset).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(flush).not.toHaveBeenCalled();
    expect(billing).not.toHaveBeenCalled();
  });

  // initLocalOnly runs before the settings are read (app/_layout.tsx): a
  // write then would store the defaults over the person's record.
  it('forgets the usage-line stamp only once the settings have been read', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: true });

    initLocalOnly();
    await settle();
    expect(saved).toEqual([]);

    await hydrateSettings();
    await settle();

    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(saved.at(-1)).toMatchObject({ usageNoticeShownAt: null });
  });

  it('when an under-13 answer arrives mid-run', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    await hydrateSettings();
    initLocalOnly();
    expect(clear).not.toHaveBeenCalled();

    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();
    await settle();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(coachReset).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    // Uploads never start under the rule.
    expect(flush).not.toHaveBeenCalled();
    expect(billing).not.toHaveBeenCalled();
  });

  it('wipes nothing and signs nobody out', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated' });
    initLocalOnly();

    await useAgeStore.getState().accept(UNDER_13);
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ userId: 'user-1', status: 'authenticated' });
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('leaving the rule', () => {
  it('resumes the refresh, syncs a signed-in account, flushes and starts billing', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated' });
    useAgeStore.getState().load(UNDER_13, { willAsk: true });
    await hydrateSettings();
    initLocalOnly();
    useAgeStore.getState().markSettled();
    jest.clearAllMocks();

    await useAgeStore.getState().accept(TEEN);
    await settle();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith('user-1');
    expect(flush).toHaveBeenCalledWith('user-1');
    expect(billing).toHaveBeenCalledTimes(1);
  });

  it('for a guest, flushes (the flush decides) but has nothing to sync', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    initLocalOnly();

    await useAgeStore.getState().accept(TEEN);
    await settle();

    expect(sync).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledWith(LOCAL_GUEST_USER_ID);
  });

  it('a lift before Apple settles starts uploads only once it does', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: true });
    initLocalOnly();

    await useAgeStore.getState().accept(TEEN);
    await settle();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();

    useAgeStore.getState().markSettled();
    await settle();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(billing).toHaveBeenCalledTimes(1);
  });
});

describe('Apple answering on a launch that asks, with no rule', () => {
  it('starts the deferred uploads, and nothing else', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    initLocalOnly();

    await useAgeStore.getState().accept({ lowerBound: 18, upperBound: null });
    useAgeStore.getState().markSettled();
    await settle();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(billing).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('where nothing is asked, does nothing at all', async () => {
    initLocalOnly();
    await settle();

    expect(clear).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(billing).not.toHaveBeenCalled();
  });
});

describe('initLocalOnly', () => {
  it('is idempotent: a second call adds nothing', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });

    initLocalOnly();
    initLocalOnly();
    await settle();
    expect(clear).toHaveBeenCalledTimes(1);

    await useAgeStore.getState().accept(TEEN);
    await settle();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('never throws, and each step goes on when another fails', async () => {
    clear.mockImplementation(() => {
      throw new Error('disk');
    });
    pause.mockRejectedValue(new Error('auth'));
    coachReset.mockImplementation(() => {
      throw new Error('coach');
    });
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    await hydrateSettings();

    expect(() => initLocalOnly()).not.toThrow();
    await settle();

    expect(clear).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(coachReset).toHaveBeenCalled();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();

    resume.mockRejectedValue(new Error('auth'));
    sync.mockRejectedValue(new Error('net'));
    flush.mockRejectedValue(new Error('net'));
    billing.mockRejectedValue(new Error('rc'));
    await expect(useAgeStore.getState().accept(TEEN)).resolves.toBe(true);
    await settle();
    expect(flush).toHaveBeenCalled();
    expect(billing).toHaveBeenCalled();
  });
});

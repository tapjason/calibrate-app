import { AppState } from 'react-native';

import {
  __setBillingDepsForTests,
  type BillingDeps,
  type PlusPlan,
  type TrialStatus,
} from '@/billing/revenuecat';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useSettingsStore } from '@/store/settingsStore';

import { __resetPermissionStateForTests } from './permissionState';
import {
  TRIAL_REMINDER_ID,
  TRIAL_REMINDER_PLACEHOLDER,
  __setTrialReminderApiForTests,
  initTrialReminder,
  refreshTrialReminder,
  syncTrialReminder,
  trialReminderCopy,
  trialReminderTime,
  type TrialReminderApi,
} from './trialReminder';

const annualPlan: PlusPlan = {
  packageId: '$rc_annual',
  plan: 'annual',
  priceString: '$29.99',
  trialDays: 30,
  trialPeriod: { count: 1, unit: 'MONTH' },
} as PlusPlan;

// Ends Saturday 7 Nov 2026 at 15:00 local.
const endsAt = new Date(2026, 10, 7, 15, 0, 0).toISOString();
const trial = (overrides: Partial<TrialStatus> = {}): TrialStatus => ({
  endsAt,
  willRenew: true,
  plan: 'annual',
  ...overrides,
});
const before = new Date(2026, 9, 8, 12, 0, 0);

function fakeApi(granted = true) {
  const scheduled: Parameters<TrialReminderApi['scheduleNotificationAsync']>[0][] = [];
  const cancelled: string[] = [];
  const categories: string[] = [];
  const api: TrialReminderApi = {
    getPermissionsAsync: async () => ({ granted }),
    scheduleNotificationAsync: async (req) => {
      scheduled.push(req);
      return req.identifier;
    },
    cancelScheduledNotificationAsync: async (id) => {
      cancelled.push(id);
    },
    setNotificationCategoryAsync: async (_id, _actions, options) => {
      categories.push(options.previewPlaceholder);
      return null;
    },
  };
  return { api, scheduled, cancelled, categories };
}

afterEach(() => __setTrialReminderApiForTests(undefined));

describe('trialReminderTime (roadmap D16)', () => {
  it('fires at 10:00 local two calendar days before the trial ends', () => {
    expect(trialReminderTime(endsAt)).toEqual(new Date(2026, 10, 5, 10, 0, 0, 0));
  });

  it('has no time for an unreadable date', () => {
    expect(trialReminderTime('not a date')).toBeNull();
  });
});

describe('trialReminderCopy', () => {
  it('says when it renews and at the store price, and nothing else', () => {
    const { title, body } = trialReminderCopy(trial(), [annualPlan]);
    expect(title).toMatch(/^Your free trial ends \S+$/);
    expect(body).toBe('Plus then renews for a year at $29.99.');
  });

  it('says only that it renews when the store gave no price', () => {
    expect(trialReminderCopy(trial(), []).body).toBe('Plus then renews as a paid plan.');
    expect(trialReminderCopy(trial({ plan: null }), [annualPlan]).body).toBe(
      'Plus then renews as a paid plan.',
    );
  });
});

describe('syncTrialReminder', () => {
  it('schedules one reminder, under a stable id, behind a hidden-preview placeholder', async () => {
    const fake = fakeApi();
    __setTrialReminderApiForTests(fake.api);
    await expect(
      syncTrialReminder(trial(), [annualPlan], { enabled: true, now: before }),
    ).resolves.toBe('scheduled');
    expect(fake.scheduled).toHaveLength(1);
    expect(fake.scheduled[0].identifier).toBe(TRIAL_REMINDER_ID);
    expect(fake.scheduled[0].trigger).toEqual({
      type: 'date',
      date: new Date(2026, 10, 5, 10, 0, 0, 0),
    });
    expect(fake.categories).toEqual([TRIAL_REMINDER_PLACEHOLDER]);
  });

  it('cancels it once the trial is cancelled, over, or notifications are off', async () => {
    for (const [status, enabled] of [
      [trial({ willRenew: false }), true],
      [null, true],
      [trial(), false],
    ] as const) {
      const fake = fakeApi();
      __setTrialReminderApiForTests(fake.api);
      await expect(
        syncTrialReminder(status, [annualPlan], { enabled, now: before }),
      ).resolves.toBe('cancelled');
      expect(fake.cancelled).toEqual([TRIAL_REMINDER_ID]);
      expect(fake.scheduled).toHaveLength(0);
    }
  });

  it('sends nothing for a reminder time already past', async () => {
    const fake = fakeApi();
    __setTrialReminderApiForTests(fake.api);
    const late = new Date(2026, 10, 6, 9, 0, 0);
    await expect(
      syncTrialReminder(trial(), [annualPlan], { enabled: true, now: late }),
    ).resolves.toBe('cancelled');
    expect(fake.scheduled).toHaveLength(0);
  });

  it('never asks for permission, and does nothing without it', async () => {
    const fake = fakeApi(false);
    __setTrialReminderApiForTests(fake.api);
    await expect(
      syncTrialReminder(trial(), [annualPlan], { enabled: true, now: before }),
    ).resolves.toBe('skipped');
    expect(fake.scheduled).toHaveLength(0);
  });

  it('is a no-op where there are no notifications (web)', async () => {
    __setTrialReminderApiForTests(null);
    await expect(
      syncTrialReminder(trial(), [annualPlan], { enabled: true, now: before }),
    ).resolves.toBe('skipped');
  });
});

describe('refreshTrialReminder', () => {
  /** A RevenueCat seam whose every method throws: asking it would show. */
  function throwingBilling(): { deps: BillingDeps; touched: string[] } {
    const touched: string[] = [];
    const deps = new Proxy({} as BillingDeps, {
      get(_target, prop) {
        touched.push(String(prop));
        throw new Error(`RevenueCat was asked: ${String(prop)}`);
      },
    });
    return { deps, touched };
  }

  beforeEach(() => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'test_key';
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    __setBillingDepsForTests(null);
    __resetAgeStoreForTests();
    useSettingsStore.setState({ notificationsEnabled: true });
    jest.restoreAllMocks();
  });

  // Off means off, whether or not RevenueCat can be reached (and on a
  // local-only phone it is never asked).
  it('with notifications off, cancels the reminder without asking RevenueCat', async () => {
    const fake = fakeApi();
    __setTrialReminderApiForTests(fake.api);
    const { deps, touched } = throwingBilling();
    __setBillingDepsForTests(deps);
    useSettingsStore.setState({ notificationsEnabled: false });

    await refreshTrialReminder();

    expect(fake.cancelled).toEqual([TRIAL_REMINDER_ID]);
    expect(touched).toEqual([]);
  });

  // The under-13 rule (D70): RevenueCat is never asked, so nothing is
  // scheduled; a reminder scheduled before stays, as when it can't be reached.
  it('on a local-only phone, asks RevenueCat nothing and schedules nothing', async () => {
    const fake = fakeApi();
    __setTrialReminderApiForTests(fake.api);
    const { deps, touched } = throwingBilling();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load({ lowerBound: null, upperBound: 12 }, { willAsk: false });

    await refreshTrialReminder();

    expect(fake.scheduled).toEqual([]);
    expect(fake.cancelled).toEqual([]);
    expect(touched).toEqual([]);
  });

  // Review round 2, item 4: RevenueCat hasn't started while Apple's answer is
  // pending on a launch that asks; the reminder doesn't ask it either, and a
  // scheduled one is left as it is. Off still cancels.
  it("while Apple's answer is pending, asks RevenueCat nothing and leaves the reminder as it is", async () => {
    const fake = fakeApi();
    __setTrialReminderApiForTests(fake.api);
    const { deps, touched } = throwingBilling();
    __setBillingDepsForTests(deps);
    useAgeStore.getState().load(null, { willAsk: true });

    await refreshTrialReminder();
    expect(fake.scheduled).toEqual([]);
    expect(fake.cancelled).toEqual([]);
    expect(touched).toEqual([]);

    useSettingsStore.setState({ notificationsEnabled: false });
    await refreshTrialReminder();
    expect(fake.cancelled).toEqual([TRIAL_REMINDER_ID]);
    expect(touched).toEqual([]);
  });
});

// Security review, 2026-11-18, round 4: the paywall names this reminder only
// while iOS permission is granted, so startup also starts reading it, at once
// and on every return to the foreground.
describe('initTrialReminder: the permission the paywall reads', () => {
  afterEach(() => {
    __resetPermissionStateForTests();
    jest.restoreAllMocks();
    useSettingsStore.setState({ notificationPermission: null });
  });

  it('reads the permission at startup and again when the app comes back', async () => {
    let answer = { granted: true, status: 'granted' };
    __resetPermissionStateForTests({ getPermissionsAsync: async () => answer });
    let onChange: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        onChange = listener as (state: string) => void;
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    const settle = () => new Promise((r) => setImmediate(r));

    initTrialReminder();
    await settle();
    expect(useSettingsStore.getState().notificationPermission).toBe('granted');

    // Turned off in iOS Settings while the app was away.
    answer = { granted: false, status: 'denied' };
    onChange?.('active');
    await settle();
    expect(useSettingsStore.getState().notificationPermission).toBe('denied');
  });
});

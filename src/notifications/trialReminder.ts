// A reminder before a free trial turns into a paid plan (roadmap D16,
// decided 2026-10-07).
//
// Billing is the largest complaint in the element research's 8,057 reviews,
// and most of it is about charges and trials. So two days before the trial
// ends, one local notification says when it renews and at what price, both
// from the store. It never sells: no offer, no "upgrade", only the date and
// the price (DESIGN_SYSTEM §7.15). Cancelled once the trial is cancelled, the
// trial ends, or notifications are turned off.
//
// Layer rule: L5. Reads the trial and the price from billing and the
// notifications toggle from settingsStore; every failure is logged and
// swallowed, like the other schedulers.

import { Platform } from 'react-native';

import {
  fetchPlans,
  fetchTrialStatus,
  type PlanId,
  type PlusPlan,
  type TrialStatus,
} from '@/billing/revenuecat';
import { useSettingsStore } from '@/store/settingsStore';

export const TRIAL_REMINDER_ID = 'calibrate-trial-ending';
export const TRIAL_REMINDER_CATEGORY = 'calibrate-trial-ending';
/** Hidden-preview text: no price or plan on a locked screen. */
export const TRIAL_REMINDER_PLACEHOLDER = 'About your Plus trial';
/** Days before the trial's end. */
export const TRIAL_REMINDER_DAYS_BEFORE = 2;
/** Local hour it fires on that day: daytime, not the middle of the night. */
export const TRIAL_REMINDER_HOUR = 10;

export interface TrialReminderApi {
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(req: {
    identifier: string;
    content: { title: string; body: string; data?: Record<string, unknown>; categoryIdentifier?: string };
    trigger: { type: 'date'; date: Date };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  setNotificationCategoryAsync?(
    identifier: string,
    actions: [],
    options: { previewPlaceholder: string },
  ): Promise<unknown>;
}

/** When the reminder fires: TRIAL_REMINDER_HOUR local, two calendar days before the end. */
export function trialReminderTime(endsAt: string): Date | null {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate() - TRIAL_REMINDER_DAYS_BEFORE,
    TRIAL_REMINDER_HOUR,
    0,
    0,
    0,
  );
}

const PERIOD_WORDS: Partial<Record<PlanId, string>> = { annual: 'a year', monthly: 'a month' };

/**
 * Title-style title without punctuation, a body that states the facts
 * (§7.15): "Your free trial ends Thursday" · "Plus then renews for a year at
 * $29.99." Without a price from the store it says only that it renews.
 */
export function trialReminderCopy(
  status: TrialStatus,
  plans: readonly PlusPlan[],
): { title: string; body: string } {
  const day = new Date(status.endsAt).toLocaleDateString(undefined, { weekday: 'long' });
  const plan = status.plan ? plans.find((p) => p.plan === status.plan) : undefined;
  const period = status.plan ? PERIOD_WORDS[status.plan] : undefined;
  const body =
    plan && period
      ? `Plus then renews for ${period} at ${plan.priceString}.`
      : 'Plus then renews as a paid plan.';
  return { title: `Your free trial ends ${day}`, body };
}

function defaultApi(): TrialReminderApi | null {
  if (Platform.OS === 'web') return null;
  // Lazy: keep Jest and the web bundle off the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  return {
    async getPermissionsAsync() {
      return { granted: (await Notifications.getPermissionsAsync()).granted };
    },
    async scheduleNotificationAsync(req) {
      return await Notifications.scheduleNotificationAsync({
        identifier: req.identifier,
        content: req.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: req.trigger.date },
      });
    },
    async cancelScheduledNotificationAsync(id) {
      await Notifications.cancelScheduledNotificationAsync(id);
    },
    async setNotificationCategoryAsync(identifier, actions, options) {
      return await Notifications.setNotificationCategoryAsync(identifier, actions, options);
    },
  };
}

let api: TrialReminderApi | null | undefined;

/** Test-only: swap the notifications module (null = unsupported), or restore it. */
export function __setTrialReminderApiForTests(next: TrialReminderApi | null | undefined): void {
  api = next;
}

/**
 * Make the scheduled reminder match the trial: one at the right time while a
 * trial is running and set to renew, none otherwise. Idempotent: the stable
 * identifier replaces any earlier request.
 */
export async function syncTrialReminder(
  status: TrialStatus | null,
  plans: readonly PlusPlan[],
  { enabled, now = new Date() }: { enabled: boolean; now?: Date },
): Promise<'scheduled' | 'cancelled' | 'skipped'> {
  const notifications = api === undefined ? defaultApi() : api;
  if (!notifications) return 'skipped';
  try {
    const at = status ? trialReminderTime(status.endsAt) : null;
    if (!status || !status.willRenew || !enabled || !at || at.getTime() <= now.getTime()) {
      await notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
      return 'cancelled';
    }
    // Check, never ask: permission is asked in context, for reminders.
    if (!(await notifications.getPermissionsAsync()).granted) return 'skipped';
    await notifications.setNotificationCategoryAsync?.(TRIAL_REMINDER_CATEGORY, [], {
      previewPlaceholder: TRIAL_REMINDER_PLACEHOLDER,
    });
    const { title, body } = trialReminderCopy(status, plans);
    await notifications.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: { title, body, data: { kind: 'trial' }, categoryIdentifier: TRIAL_REMINDER_CATEGORY },
      trigger: { type: 'date', date: at },
    });
    return 'scheduled';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[trial] reminder sync failed:', e);
    return 'skipped';
  }
}

let settingsUnsub: (() => void) | null = null;

/**
 * Follow the notifications toggle, as the reminders and the digest do: off
 * cancels the trial reminder, on brings it back. Call once at startup.
 */
export function initTrialReminder(): void {
  if (settingsUnsub) return;
  settingsUnsub = useSettingsStore.subscribe((state, prev) => {
    if (state.notificationsEnabled !== prev.notificationsEnabled) void refreshTrialReminder();
  });
}

/** Test-only: drop the toggle subscription. */
export function __resetTrialReminderForTests(): void {
  settingsUnsub?.();
  settingsUnsub = null;
}

/**
 * Ask billing where the trial stands and sync the reminder. Called after a
 * purchase, on every entitlement refresh (launch, sign-in, return to the
 * app) and when the notifications toggle changes. If RevenueCat can't be
 * reached, a scheduled reminder is left as it is.
 */
export async function refreshTrialReminder(): Promise<void> {
  try {
    const status = await fetchTrialStatus();
    if (status === undefined) return;
    const plans = status ? await fetchPlans() : [];
    await syncTrialReminder(status, plans, {
      enabled: useSettingsStore.getState().notificationsEnabled,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[trial] reminder refresh failed:', e);
  }
}

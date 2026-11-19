// The phone's notification permission, kept in settingsStore for screens that
// must not promise a notification the phone won't show (security review,
// 2026-11-18, round 4): the paywall's trial timeline named the reminder two
// days before renewal whenever the app's Notifications switch was on, but
// trialReminder.ts schedules nothing without iOS permission.
//
// Read, never asked: asking stays in context (permission.ts). Read at launch
// (from initTrialReminder), each time the app comes back to the foreground
// (where a change made in iOS Settings shows up) and after the app asks
// (askForReminders). Never stored: it is the phone's state, not a choice.
//
// Layer rule: L5. Writes settingsStore (L4), never the reverse. Every failure
// is logged and swallowed, and leaves the state unknown (null), which the
// paywall reads as no: a promise not made is the safe side.

import { AppState, Platform } from 'react-native';

import { useSettingsStore, type NotificationPermission } from '@/store/settingsStore';

/** The one call this module makes to expo-notifications. */
export interface PermissionReadApi {
  getPermissionsAsync(): Promise<{ granted: boolean; status?: string }>;
}

function defaultApi(): PermissionReadApi | null {
  // No local notifications on web: the permission stays unknown there.
  if (Platform.OS === 'web') return null;
  // Lazy: keep Jest and the web bundle off the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  return {
    async getPermissionsAsync() {
      const res = await Notifications.getPermissionsAsync();
      return { granted: res.granted, status: res.status };
    },
  };
}

let api: PermissionReadApi | null | undefined;
/** Bumped by every read, so a slow earlier read can't overwrite a later one. */
let readSeq = 0;
let appStateSub: { remove: () => void } | null = null;

/**
 * What the system's answer means here. `'granted'` exactly when `granted` is
 * true, the same test every scheduler makes before it schedules; otherwise
 * `'undetermined'` while the app can still ask, and `'denied'` for anything
 * else. Exported for tests.
 */
export function permissionFrom(answer: unknown): NotificationPermission {
  if (typeof answer !== 'object' || answer === null) {
    throw new Error('not a permission answer');
  }
  const { granted, status } = answer as { granted?: unknown; status?: unknown };
  if (granted === true) return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

/**
 * Read the permission and put it in settingsStore. Never asks and never
 * throws: a build with no notifications module (web), a read that fails or an
 * answer that can't be read leaves it null, unknown.
 */
export async function refreshNotificationPermission(): Promise<void> {
  const seq = ++readSeq;
  let next: NotificationPermission | null = null;
  try {
    const notifications = api === undefined ? defaultApi() : api;
    next = notifications ? permissionFrom(await notifications.getPermissionsAsync()) : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[notifications] could not read the permission:',
      e instanceof Error ? e.message : 'unknown error',
    );
    next = null;
  }
  // A read started since this one has the newer answer.
  if (seq !== readSeq) return;
  try {
    useSettingsStore.getState().setNotificationPermission(next);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[notifications] could not hold the permission:',
      e instanceof Error ? e.message : 'unknown error',
    );
  }
}

/**
 * Read the permission now and again on every return to the foreground. Call
 * once at startup (initTrialReminder does); later calls do nothing.
 */
export function trackNotificationPermission(): void {
  if (appStateSub) return;
  void refreshNotificationPermission();
  appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') void refreshNotificationPermission();
  });
}

/** Test-only: swap the notifications module (null = none), and stop tracking. */
export function __resetPermissionStateForTests(next?: PermissionReadApi | null): void {
  appStateSub?.remove();
  appStateSub = null;
  readSeq = 0;
  api = next;
}

// Weekly digest scheduler. One repeating notification, Sunday 18:00 local.
// Body summarizes the current pending count so taps land in an already-
// relevant context.
//
// Layer rule: L5 (services). Reads from L4 (predictionStore) the same way
// the resolution-reminder scheduler does. Failure here must never affect the
// offline core loop — every call is wrapped, every error is logged-and-
// swallowed.
//
// Lifecycle:
//   1. initDigest() runs once at app start, after auth/db init.
//   2. We request permission. Denied → log a warning and stay no-op.
//   3. We schedule a single WEEKLY notification using a stable identifier
//      (DIGEST_NOTIFICATION_ID) so we can re-schedule by passing the same id.
//   4. We subscribe to predictionStore.pending. When the count changes we
//      reschedule with a refreshed body. Bucket-stable changes (e.g. 4 → 5
//      both fall in the "many" bucket) still trigger a reschedule because
//      the exact count appears in the body.
//
// Platform: iOS/Android only. Web logs once at startup and stays silent —
// no warnings on later operations, mirroring scheduler.ts.
//
// Coexistence with scheduler.ts:
//   - scheduler.ts already calls setNotificationHandler() globally, so we
//     don't repeat that here.
//   - scheduler.ts's tap handler bails when data.predictionId is missing,
//     so a digest tap just opens the app — no extra handler needed for MVP.

import { Platform } from 'react-native';

import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';

// Sunday at 18:00 local. expo-notifications weekday is 1..7 with 1 = Sunday.
const DIGEST_WEEKDAY = 1;
const DIGEST_HOUR = 18;
const DIGEST_MINUTE = 0;

// Stable identifier lets re-scheduling replace the previous request without
// needing to remember the OS-generated id across calls.
const DIGEST_NOTIFICATION_ID = 'calibrate-weekly-digest';

export interface DigestNotificationsApi {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(req: {
    identifier: string;
    content: { title: string; body: string; data?: Record<string, unknown> };
    trigger: { type: 'weekly'; weekday: number; hour: number; minute: number };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
}

interface Deps {
  notifications: DigestNotificationsApi | null; // null on web / unsupported
}

let deps: Deps | null = null;
let initialized = false;
let permissionGranted = false;
let lastScheduledCount: number | null = null;
// Mirrors settingsStore.notificationsEnabled — the digest obeys the same
// single toggle as resolution reminders.
let notificationsEnabled = true;
let storeUnsub: (() => void) | null = null;
let settingsUnsub: (() => void) | null = null;

function defaultNotificationsApi(): DigestNotificationsApi | null {
  if (Platform.OS === 'web') {
    return null;
  }
  // Lazy require: keep Jest from loading the native module on the server.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications =
    require('expo-notifications') as typeof import('expo-notifications');
  return {
    async requestPermissionsAsync() {
      const res = await Notifications.requestPermissionsAsync();
      return { granted: res.granted };
    },
    async scheduleNotificationAsync(req) {
      return await Notifications.scheduleNotificationAsync({
        identifier: req.identifier,
        content: req.content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: req.trigger.weekday,
          hour: req.trigger.hour,
          minute: req.trigger.minute,
        },
      });
    },
    async cancelScheduledNotificationAsync(id) {
      await Notifications.cancelScheduledNotificationAsync(id);
    },
  };
}

/** Test-only: override the platform deps and reset module state. */
export function __setDepsForTests(next: Deps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setDepsForTests is only allowed when NODE_ENV=test');
  }
  deps = next;
  initialized = false;
  permissionGranted = false;
  lastScheduledCount = null;
  notificationsEnabled = true;
  if (storeUnsub) {
    storeUnsub();
    storeUnsub = null;
  }
  if (settingsUnsub) {
    settingsUnsub();
    settingsUnsub = null;
  }
}

function buildBody(pendingCount: number): string {
  if (pendingCount === 0) {
    return 'No open predictions — log one to keep your streak going.';
  }
  if (pendingCount === 1) {
    return 'You have 1 open prediction. Tap to check in.';
  }
  return `You have ${pendingCount} open predictions. Tap to check in.`;
}

async function scheduleDigest(pendingCount: number): Promise<void> {
  if (!deps || !deps.notifications || !permissionGranted || !notificationsEnabled)
    return;
  if (lastScheduledCount === pendingCount) return;

  try {
    // Same identifier replaces the prior request — no explicit cancel needed.
    await deps.notifications.scheduleNotificationAsync({
      identifier: DIGEST_NOTIFICATION_ID,
      content: {
        title: 'Weekly check-in',
        body: buildBody(pendingCount),
        data: { kind: 'digest' },
      },
      trigger: {
        type: 'weekly',
        weekday: DIGEST_WEEKDAY,
        hour: DIGEST_HOUR,
        minute: DIGEST_MINUTE,
      },
    });
    lastScheduledCount = pendingCount;
  } catch (e) {
    // Swallow: store transactions already committed; user data is safe.
    // eslint-disable-next-line no-console
    console.warn('[digest] schedule failed:', e);
  }
}

/**
 * React to the notifications toggle. Off → cancel the standing weekly digest
 * and forget the last-scheduled count so a later re-enable reschedules. On →
 * schedule afresh from the current pending count.
 */
async function applyEnabled(enabled: boolean): Promise<void> {
  if (enabled === notificationsEnabled) return;
  notificationsEnabled = enabled;
  if (!deps || !deps.notifications || !permissionGranted) return;

  if (!enabled) {
    lastScheduledCount = null;
    try {
      await deps.notifications.cancelScheduledNotificationAsync(
        DIGEST_NOTIFICATION_ID,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[digest] cancel failed:', e);
    }
    return;
  }

  await scheduleDigest(usePredictionStore.getState().pending.length);
}

/**
 * Bootstraps the weekly digest: requests permission and schedules the first
 * occurrence, then subscribes to predictionStore to refresh the body when the
 * pending count changes. Idempotent — repeated calls are no-ops.
 */
export async function initDigest(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!deps) {
    deps = { notifications: defaultNotificationsApi() };
  }

  if (!deps.notifications) {
    // eslint-disable-next-line no-console
    console.debug('[digest] not supported on web; no-op mode');
    return;
  }

  // Permission may already be granted by scheduler.ts — the OS returns the
  // existing grant without re-prompting.
  const { granted } = await deps.notifications.requestPermissionsAsync();
  permissionGranted = granted;
  if (!granted) {
    // eslint-disable-next-line no-console
    console.warn('[digest] permission denied; weekly digest disabled');
    return;
  }

  notificationsEnabled = useSettingsStore.getState().notificationsEnabled;
  await scheduleDigest(usePredictionStore.getState().pending.length);

  storeUnsub = usePredictionStore.subscribe((state, prev) => {
    if (state.pending === prev.pending) return;
    if (state.pending.length === prev.pending.length) return;
    void scheduleDigest(state.pending.length);
  });

  settingsUnsub = useSettingsStore.subscribe((state, prev) => {
    if (state.notificationsEnabled === prev.notificationsEnabled) return;
    void applyEnabled(state.notificationsEnabled);
  });
}

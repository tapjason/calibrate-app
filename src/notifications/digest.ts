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
//   2. We CHECK permission, never ask (roadmap step 38). Not granted → stay
//      no-op until activateDigest() runs, right after the user allows
//      reminders from the in-context prompt.
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

import { DIGEST_CATEGORY, DIGEST_PLACEHOLDER, DIGEST_TITLE, digestBody } from './copy';

// Sunday at 18:00 local. expo-notifications weekday is 1..7 with 1 = Sunday.
const DIGEST_WEEKDAY = 1;
const DIGEST_HOUR = 18;
const DIGEST_MINUTE = 0;

// Stable identifier lets re-scheduling replace the previous request without
// needing to remember the OS-generated id across calls.
const DIGEST_NOTIFICATION_ID = 'calibrate-weekly-digest';

export interface DigestNotificationsApi {
  /** Reads the current answer without asking. */
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(req: {
    identifier: string;
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      categoryIdentifier?: string;
      /** HIG: a leisure read is Passive — it never breaks through a Focus. */
      interruptionLevel?: 'passive';
    };
    trigger: { type: 'weekly'; weekday: number; hour: number; minute: number };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  /**
   * Registers a notification category. Optional: on iOS it carries the
   * hidden-preview placeholder; elsewhere (and in tests) it may be absent.
   */
  setNotificationCategoryAsync?(
    identifier: string,
    actions: [],
    options: { previewPlaceholder: string },
  ): Promise<unknown>;
}

interface Deps {
  notifications: DigestNotificationsApi | null; // null on web / unsupported
}

let deps: Deps | null = null;
let initialized = false;
let permissionGranted = false;
// True once the post-permission setup has run (activateDigest()).
let active = false;
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
    async getPermissionsAsync() {
      const res = await Notifications.getPermissionsAsync();
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
    async setNotificationCategoryAsync(identifier, actions, options) {
      return await Notifications.setNotificationCategoryAsync(identifier, actions, options);
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
  active = false;
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

async function scheduleDigest(pendingCount: number): Promise<void> {
  if (!deps || !deps.notifications || !permissionGranted || !notificationsEnabled)
    return;
  if (lastScheduledCount === pendingCount) return;

  try {
    // Same identifier replaces the prior request — no explicit cancel needed.
    await deps.notifications.scheduleNotificationAsync({
      identifier: DIGEST_NOTIFICATION_ID,
      content: {
        title: DIGEST_TITLE,
        body: digestBody(pendingCount),
        data: { kind: 'digest' },
        categoryIdentifier: DIGEST_CATEGORY,
        interruptionLevel: 'passive',
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

  // Check, don't ask: the scheduler's in-context prompt asks for both
  // (roadmap step 38), then calls activateDigest().
  let granted = false;
  try {
    ({ granted } = await deps.notifications.getPermissionsAsync());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[digest] could not read permission:', e);
  }
  if (!granted) return;
  await activateDigest();
}

/**
 * Start the weekly digest once permission is granted: at launch for someone
 * who already allowed notifications, or straight after the in-context prompt.
 * Idempotent.
 */
export async function activateDigest(): Promise<void> {
  if (active) return;
  if (!deps) deps = { notifications: defaultNotificationsApi() };
  if (!deps.notifications) return;
  active = true;
  permissionGranted = true;

  // Best-effort: without it iOS falls back to its generic placeholder.
  try {
    await deps.notifications.setNotificationCategoryAsync?.(DIGEST_CATEGORY, [], {
      previewPlaceholder: DIGEST_PLACEHOLDER,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[digest] category registration failed:', e);
  }

  // The digest needs both switches (roadmap D31).
  const digestOn = (s: { notificationsEnabled: boolean; digestEnabled: boolean }) =>
    s.notificationsEnabled && s.digestEnabled;
  notificationsEnabled = digestOn(useSettingsStore.getState());
  await scheduleDigest(usePredictionStore.getState().pending.length);

  storeUnsub = usePredictionStore.subscribe((state, prev) => {
    if (state.pending === prev.pending) return;
    if (state.pending.length === prev.pending.length) return;
    void scheduleDigest(state.pending.length);
  });

  settingsUnsub = useSettingsStore.subscribe((state, prev) => {
    const next = digestOn(state);
    if (next === digestOn(prev)) return;
    void applyEnabled(next);
  });
}

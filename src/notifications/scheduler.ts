// Resolution-reminder scheduler. Sits in L5 — it observes the L4
// predictionStore via Zustand's subscribe API and reacts. The store has zero
// knowledge that notifications exist; that one-way dependency keeps the
// offline core loop functional even when this module is absent or broken.
//
// Lifecycle:
//   1. initNotifications() is called once at app start (after auth init).
//   2. We ask for permission. If denied → log a warning, install no
//      subscriptions, return. Subsequent calls are idempotent no-ops.
//   3. We install the tap handler that deep-links to /resolve/[id].
//   4. We subscribe to predictionStore. On every change we diff the new
//      pending set against the previous pending set and:
//        - newly-pending ids → schedule a notification at due_date
//        - ids that disappeared, or transitioned out of pending → cancel
//
// Platform: expo-notifications is iOS/Android only. On web every operation is
// a no-op (single debug log at startup, no warnings on later calls).
//
// NOT IMPLEMENTED on purpose: we do not backfill notifications for
// predictions that were already pending before initNotifications() ran. The
// initial snapshot is taken as the baseline, and only future transitions are
// acted upon. Acceptable for MVP; revisit if first-launch retention suffers.

import { Platform } from 'react-native';

import type { Prediction } from '@/types';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';

// Injected dependencies (the platform Notifications module and the navigator).
// Pulled to the top so tests can swap them in via __setDepsForTests without
// jest.mock voodoo against a native module that wouldn't load in Node anyway.
export interface NotificationsApi {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(req: {
    content: { title: string; body: string; data?: Record<string, unknown> };
    trigger: { type: 'date'; date: Date };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(
    listener: (event: {
      notification: { request: { content: { data?: Record<string, unknown> } } };
    }) => void,
  ): { remove: () => void };
  /**
   * The notification response that launched the app from a killed state, or
   * null if the app was opened normally. addNotificationResponseReceivedListener
   * only fires for taps received while it is installed, so the launching tap
   * (cold start) has to be read explicitly via this call.
   */
  getLastNotificationResponseAsync(): Promise<{
    notification: { request: { content: { data?: Record<string, unknown> } } };
  } | null>;
}

export interface Navigator {
  push(path: string): void;
}

interface Deps {
  notifications: NotificationsApi | null; // null on web / unsupported
  navigator: Navigator;
}

let deps: Deps | null = null;
let initialized = false;
let permissionGranted = false;
// Mirrors settingsStore.notificationsEnabled. Seeded at init and kept in sync
// by a store subscription so the user can turn reminders off at runtime.
let notificationsEnabled = true;

// Maps prediction id → the OS-level identifier returned by
// scheduleNotificationAsync. We keep this rather than re-deriving an id from
// the prediction id because expo-notifications doesn't expose a way to
// override identifiers consistently across platforms — using the returned id
// is the documented path.
const scheduledByPredictionId = new Map<string, string>();

// Snapshot of the last pending set we observed. Used to compute the diff on
// every store update.
let lastPendingById = new Map<string, Prediction>();

let storeUnsub: (() => void) | null = null;
let settingsUnsub: (() => void) | null = null;
let listenerSub: { remove: () => void } | null = null;

function defaultNavigator(): Navigator {
  // Lazy require so a missing expo-router doesn't crash test runs.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { router } = require('expo-router') as typeof import('expo-router');
  return {
    push: (path) => router.push(path as never),
  };
}

function defaultNotificationsApi(): NotificationsApi | null {
  if (Platform.OS === 'web') {
    return null;
  }
  // Lazy require: keeps Jest from loading the native module and lets us
  // bail out cleanly on web above.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications =
    require('expo-notifications') as typeof import('expo-notifications');
  return {
    async requestPermissionsAsync() {
      const res = await Notifications.requestPermissionsAsync();
      return { granted: res.granted };
    },
    async scheduleNotificationAsync(req) {
      // The SDK's `trigger` enum is `SchedulableTriggerInputTypes.DATE`
      // which is the string literal "date" at runtime. We type our adapter
      // surface with the literal directly so this module has no runtime
      // dependency on the SDK's enum object.
      return await Notifications.scheduleNotificationAsync({
        content: req.content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: req.trigger.date,
        },
      });
    },
    async cancelScheduledNotificationAsync(id) {
      await Notifications.cancelScheduledNotificationAsync(id);
    },
    setNotificationHandler(handler) {
      Notifications.setNotificationHandler(
        handler as Parameters<typeof Notifications.setNotificationHandler>[0],
      );
    },
    addNotificationResponseReceivedListener(listener) {
      return Notifications.addNotificationResponseReceivedListener(
        listener as Parameters<
          typeof Notifications.addNotificationResponseReceivedListener
        >[0],
      );
    },
    async getLastNotificationResponseAsync() {
      return await Notifications.getLastNotificationResponseAsync();
    },
  };
}

/** Test-only: override the platform deps. */
export function __setDepsForTests(next: Deps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setDepsForTests is only allowed when NODE_ENV=test');
  }
  // Reset all module-level state so tests start fresh.
  deps = next;
  initialized = false;
  permissionGranted = false;
  notificationsEnabled = true;
  scheduledByPredictionId.clear();
  lastPendingById = new Map();
  if (storeUnsub) {
    storeUnsub();
    storeUnsub = null;
  }
  if (settingsUnsub) {
    settingsUnsub();
    settingsUnsub = null;
  }
  if (listenerSub) {
    listenerSub.remove();
    listenerSub = null;
  }
}

function trimBody(title: string): string {
  const max = 80;
  if (title.length <= max) return title;
  return title.slice(0, max - 1).trimEnd() + '…'; // ellipsis
}

async function schedule(p: Prediction): Promise<void> {
  if (!deps || !deps.notifications || !permissionGranted || !notificationsEnabled)
    return;
  const fireDate = new Date(p.due_date);
  if (Number.isNaN(fireDate.getTime())) {
    // Bad date string would throw at the OS layer — bail rather than crash.
    // eslint-disable-next-line no-console
    console.warn(
      `[notifications] skipping schedule for ${p.id}: invalid due_date`,
    );
    return;
  }
  try {
    const id = await deps.notifications.scheduleNotificationAsync({
      content: {
        title: 'Did it happen?',
        body: trimBody(p.title),
        data: { predictionId: p.id },
      },
      trigger: { type: 'date', date: fireDate },
    });
    scheduledByPredictionId.set(p.id, id);
  } catch (e) {
    // Never let scheduling failures bubble — the store transaction has
    // already committed and the user's data is safe.
    // eslint-disable-next-line no-console
    console.warn('[notifications] schedule failed:', e);
  }
}

async function cancel(predictionId: string): Promise<void> {
  if (!deps || !deps.notifications) return;
  const id = scheduledByPredictionId.get(predictionId);
  if (!id) return;
  scheduledByPredictionId.delete(predictionId);
  try {
    await deps.notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] cancel failed:', e);
  }
}

/**
 * React to the user flipping the notifications toggle. Off → cancel every
 * reminder we've scheduled (the full kill-switch: nothing fires after the
 * user opts out). On → reschedule for everything currently pending, which
 * also (re)covers predictions that were pending before this ran.
 */
async function applyEnabled(enabled: boolean): Promise<void> {
  if (enabled === notificationsEnabled) return;
  notificationsEnabled = enabled;
  if (!deps || !deps.notifications || !permissionGranted) return;

  if (!enabled) {
    // Snapshot keys first — cancel() mutates scheduledByPredictionId.
    for (const predictionId of [...scheduledByPredictionId.keys()]) {
      void cancel(predictionId);
    }
    return;
  }

  for (const p of usePredictionStore.getState().pending) {
    if (!scheduledByPredictionId.has(p.id)) {
      void schedule(p);
    }
  }
}

function handleStoreUpdate(pending: Prediction[]): void {
  const nextById = new Map(pending.map((p) => [p.id, p] as const));

  // Cancel: any id present in the previous snapshot but missing from the new
  // one (or whose entry differs — though predictionStore.pending only ever
  // holds pending rows, so "differs" reduces to "still there"). Anything
  // gone has either been resolved or deleted.
  for (const prevId of lastPendingById.keys()) {
    if (!nextById.has(prevId)) {
      // Fire-and-forget; module-level Map already updated synchronously.
      void cancel(prevId);
    }
  }

  // Schedule: any new id we haven't already scheduled. The
  // scheduledByPredictionId check protects against duplicate scheduling
  // when, e.g., loadPending() runs again on a no-op refresh.
  for (const [id, p] of nextById) {
    if (!scheduledByPredictionId.has(id) && !lastPendingById.has(id)) {
      void schedule(p);
    }
  }

  lastPendingById = nextById;
}

/**
 * Deep-link to a prediction's Resolve screen from a notification's data
 * payload. Shared by the runtime tap listener and the cold-start launch path.
 * A missing/invalid id is ignored; navigating to an already-resolved or
 * deleted prediction degrades gracefully (ResolvePrompt shows a fallback).
 */
function routeToResolve(data: Record<string, unknown> | undefined): void {
  const predictionId = data?.predictionId;
  if (typeof predictionId !== 'string' || predictionId.length === 0) {
    return;
  }
  try {
    deps?.navigator.push(`/resolve/${predictionId}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] navigation failed:', e);
  }
}

function installTapHandler(): void {
  if (!deps || !deps.notifications) return;
  listenerSub = deps.notifications.addNotificationResponseReceivedListener(
    (event) => routeToResolve(event.notification.request.content.data),
  );
}

/**
 * Bootstraps notifications: requests permission, installs the tap handler,
 * and subscribes to predictionStore. Idempotent — safe to call more than
 * once. On web it logs once and returns.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!deps) {
    deps = {
      notifications: defaultNotificationsApi(),
      navigator: defaultNavigator(),
    };
  }

  if (!deps.notifications) {
    // eslint-disable-next-line no-console
    console.debug('[notifications] not supported on web; no-op mode');
    return;
  }

  // Foreground display behavior. Safe to call before permission check.
  deps.notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const { granted } = await deps.notifications.requestPermissionsAsync();
  permissionGranted = granted;
  if (!granted) {
    // eslint-disable-next-line no-console
    console.warn(
      '[notifications] permission denied; resolution reminders disabled',
    );
    return;
  }

  installTapHandler();

  // Seed the toggle state and react to future flips. Off cancels everything;
  // on reschedules from pending.
  notificationsEnabled = useSettingsStore.getState().notificationsEnabled;
  settingsUnsub = useSettingsStore.subscribe((state, prev) => {
    if (state.notificationsEnabled === prev.notificationsEnabled) return;
    void applyEnabled(state.notificationsEnabled);
  });

  // Seed the baseline from whatever's already in the store. Per the
  // "out of scope" note in the task: we do NOT schedule for these existing
  // pending predictions. Treating the current snapshot as the baseline
  // means only future transitions trigger work.
  lastPendingById = new Map(
    usePredictionStore.getState().pending.map((p) => [p.id, p] as const),
  );

  storeUnsub = usePredictionStore.subscribe((state, prev) => {
    if (state.pending === prev.pending) return; // referential equality fast-path
    handleStoreUpdate(state.pending);
  });

  // Cold start: when a reminder tap launches the app from a killed state, the
  // listener above is installed too late to see it. Read the launching
  // response explicitly and route from it. This runs last — after the root
  // layout's setReady() has mounted the navigator — so the push lands.
  try {
    const last = await deps.notifications.getLastNotificationResponseAsync();
    if (last) {
      routeToResolve(last.notification.request.content.data);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] cold-start deep link failed:', e);
  }
}

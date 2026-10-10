// Resolution-reminder scheduler. Sits in L5 — it observes the L4
// predictionStore via Zustand's subscribe API and reacts. The store has zero
// knowledge that notifications exist; that one-way dependency keeps the
// offline core loop functional even when this module is absent or broken.
//
// Lifecycle:
//   1. initNotifications() is called once at app start (after auth init).
//   2. We CHECK permission, never ask (roadmap step 38): the system alert
//      belongs to the moment the user turns reminders on, not to launch,
//      where it would land on the Warmup. Not granted → stay inactive until
//      requestReminderPermission() is called from that moment.
//   3. Once granted, we install the tap handler that deep-links to
//      /resolve/[id].
//   4. We reconcile with what the OS already has scheduled (roadmap step
//      37): reminders from an earlier session are re-adopted for open
//      predictions and cancelled for anything else, and an open prediction
//      with no reminder gets one.
//   5. We subscribe to predictionStore. On every change we diff the new
//      pending set against the previous pending set and:
//        - newly-pending ids → schedule a notification at due_date
//        - ids that disappeared, or transitioned out of pending → cancel
//
// Platform: expo-notifications is iOS/Android only. On web every operation is
// a no-op (single debug log at startup, no warnings on later calls).
//
// The OS keeps scheduled reminders across launches, but this module's map of
// prediction id → OS identifier lives in memory. Without step 4, a relaunched
// app could not cancel a reminder it scheduled earlier (resolve early, or turn
// reminders off, and the old one still fired), and predictions that arrived
// while it wasn't watching never got one.

import { Platform } from 'react-native';

import type { Prediction } from '@/types';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';

import {
  REMINDER_CATEGORY,
  REMINDER_PLACEHOLDER,
  REMINDER_TITLE,
  reminderBody,
} from './copy';

// Injected dependencies (the platform Notifications module and the navigator).
// Pulled to the top so tests can swap them in via __setDepsForTests without
// jest.mock voodoo against a native module that wouldn't load in Node anyway.
/** A request the OS has scheduled for this app, as the reconcile reads it. */
export interface ScheduledRequest {
  identifier: string;
  content: { data?: Record<string, unknown> | null };
}

/** What the UI needs to know about notification permission. */
export type ReminderPermission = 'granted' | 'undetermined' | 'denied' | 'unsupported';

export interface NotificationsApi {
  /** Shows the system alert (once per install on iOS). */
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  /** Reads the current answer without asking. */
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean; status?: string }>;
  scheduleNotificationAsync(req: {
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      categoryIdentifier?: string;
    };
    trigger: { type: 'date'; date: Date };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  /**
   * Everything this app has scheduled with the OS, for the launch-time
   * reconcile. Optional: without it, reconciling just backfills.
   */
  getAllScheduledNotificationsAsync?(): Promise<ScheduledRequest[]>;
  /**
   * Registers a notification category. Optional: on iOS it carries the
   * hidden-preview placeholder; elsewhere (and in tests) it may be absent.
   */
  setNotificationCategoryAsync?(
    identifier: string,
    actions: [],
    options: { previewPlaceholder: string },
  ): Promise<unknown>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(
    listener: (event: {
      notification: {
        request: { identifier: string; content: { data?: Record<string, unknown> } };
      };
    }) => void,
  ): { remove: () => void };
  /**
   * The notification response that launched the app from a killed state, or
   * null if the app was opened normally. The launching tap (cold start) is
   * read explicitly via this call. Note that addNotificationResponseReceivedListener
   * may *also* replay the same launching response to a freshly-installed
   * listener, so both paths dedupe on request.identifier to navigate once.
   */
  getLastNotificationResponseAsync(): Promise<{
    notification: {
      request: { identifier: string; content: { data?: Record<string, unknown> } };
    };
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
// True once the post-permission setup has run (activate()).
let active = false;
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

// Identifiers of notification responses we've already navigated from. Guards
// against handling the same launching tap twice: the OS can deliver the
// cold-start response to BOTH the runtime listener (replayed once installed)
// and getLastNotificationResponseAsync. Whichever routes first records the id;
// the other is then a no-op.
const routedResponseIdentifiers = new Set<string>();

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
    async getPermissionsAsync() {
      const res = await Notifications.getPermissionsAsync();
      return { granted: res.granted, canAskAgain: res.canAskAgain, status: res.status };
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
    async getAllScheduledNotificationsAsync() {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.map((r) => ({
        identifier: r.identifier,
        content: { data: r.content.data as Record<string, unknown> | null },
      }));
    },
    async setNotificationCategoryAsync(identifier, actions, options) {
      return await Notifications.setNotificationCategoryAsync(identifier, actions, options);
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
  active = false;
  notificationsEnabled = true;
  scheduledByPredictionId.clear();
  routedResponseIdentifiers.clear();
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

/**
 * The local hour a reminder fires on its due day (roadmap D9, decided
 * 2026-10-05). Due dates are stored at 12:00 local, and a reminder at noon
 * asked "Did it happen?" about "I'll finish the report by Friday" before
 * Friday was over. The evening is when most of a day's outcomes are known.
 */
export const REMINDER_HOUR = 19;

/** When a prediction's reminder fires: its due day, at REMINDER_HOUR local. */
export function reminderTimeFor(dueIso: string): Date {
  const at = new Date(dueIso);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  return at;
}

async function schedule(p: Prediction): Promise<void> {
  if (!deps || !deps.notifications || !permissionGranted || !notificationsEnabled)
    return;
  const fireDate = reminderTimeFor(p.due_date);
  if (Number.isNaN(fireDate.getTime())) {
    // Bad date string would throw at the OS layer — bail rather than crash.
    // eslint-disable-next-line no-console
    console.warn(
      `[notifications] skipping schedule for ${p.id}: invalid due_date`,
    );
    return;
  }
  // A due time already past would fire the moment it's scheduled, which is
  // what a launch-time backfill of overdue predictions would otherwise do.
  // They're on Home's "Ready to resolve" list already.
  if (fireDate.getTime() <= Date.now()) return;
  try {
    const id = await deps.notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: reminderBody(p.title, p.confidence),
        // fireAt lets the launch reconcile spot a reminder set for another
        // time (one from before D9 fired at noon) and set it again.
        data: { predictionId: p.id, fireAt: fireDate.toISOString() },
        categoryIdentifier: REMINDER_CATEGORY,
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
 * Launch-time reconcile with the OS (roadmap step 37). Reminders scheduled in
 * an earlier session are adopted when their prediction is still open,
 * reminders are on, and they fire when they should now (D9 moved reminders to
 * the evening, so a noon one from before is replaced); every other reminder of
 * ours is cancelled (resolved or deleted elsewhere, a duplicate, the wrong
 * time, or reminders turned off). Then any open prediction without a reminder
 * gets one. Requests without a predictionId (the weekly digest) are left alone.
 */
async function reconcile(): Promise<void> {
  if (!deps || !deps.notifications) return;
  const api = deps.notifications;
  const open = new Map(
    usePredictionStore.getState().pending.map((p) => [p.id, p] as const),
  );

  let existing: ScheduledRequest[] = [];
  try {
    existing = (await api.getAllScheduledNotificationsAsync?.()) ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] could not read scheduled reminders:', e);
  }

  for (const request of existing) {
    const predictionId = request.content.data?.predictionId;
    if (typeof predictionId !== 'string') continue;
    const prediction = open.get(predictionId);
    const keep =
      notificationsEnabled &&
      prediction !== undefined &&
      !scheduledByPredictionId.has(predictionId) &&
      request.content.data?.fireAt === reminderTimeFor(prediction.due_date).toISOString();
    if (keep) {
      scheduledByPredictionId.set(predictionId, request.identifier);
      continue;
    }
    try {
      await api.cancelScheduledNotificationAsync(request.identifier);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[notifications] cancel failed:', e);
    }
  }

  if (!notificationsEnabled) return;
  for (const p of usePredictionStore.getState().pending) {
    if (!scheduledByPredictionId.has(p.id)) await schedule(p);
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

  // Reschedule: an open prediction whose due date or title was edited
  // (roadmap D25). The reminder fires on the due day and its body quotes the
  // title, so either change replaces it. cancel() drops the map entry at
  // once, so schedule() below doesn't see a stale one.
  for (const [id, p] of nextById) {
    const prev = lastPendingById.get(id);
    if (prev && (prev.due_date !== p.due_date || prev.title !== p.title)) {
      void cancel(id);
      void schedule(p);
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
 * Where a tapped notification leads: a reminder to its prediction's Resolve
 * screen, the practice reminder (roadmap step 89) to today's practice, and
 * anything else (the digest, the trial reminder) nowhere past opening the app.
 */
function pathFor(data: Record<string, unknown> | undefined): string | null {
  const predictionId = data?.predictionId;
  if (typeof predictionId === 'string' && predictionId.length > 0) return `/resolve/${predictionId}`;
  if (data?.kind === 'practice') return '/practice';
  return null;
}

/**
 * Deep-link from a notification response (pathFor). Shared by the runtime
 * tap listener and the cold-start launch path. A missing/invalid id is
 * ignored; navigating to an already-resolved or deleted prediction degrades
 * gracefully (ResolvePrompt shows a fallback). Responses are deduped on
 * identifier so the launching tap routes exactly once even if it reaches us
 * through both paths. The identifier is only recorded after a successful
 * push, so a push that fails (e.g. navigator not yet mounted) can still be
 * retried by the other path.
 */
function routeToResolve(request: {
  identifier: string;
  content: { data?: Record<string, unknown> };
}): void {
  if (routedResponseIdentifiers.has(request.identifier)) return;
  const path = pathFor(request.content.data);
  if (!path) return;
  try {
    deps?.navigator.push(path);
    routedResponseIdentifiers.add(request.identifier);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] navigation failed:', e);
  }
}

function installTapHandler(): void {
  if (!deps || !deps.notifications) return;
  listenerSub = deps.notifications.addNotificationResponseReceivedListener(
    (event) => routeToResolve(event.notification.request),
  );
}

/**
 * Cold start: when a reminder tap launches the app from a killed state, the
 * runtime listener is installed too late to reliably see it, so we read the
 * launching response explicitly and route from it.
 *
 * This is intentionally NOT called from initNotifications(): init is fired
 * before the root navigator mounts, and an early router.push throws ("navigate
 * before mounting the Root Layout"). The root layout calls this only once the
 * navigator is ready, which gives the push a mounted target. Dedup on
 * request.identifier keeps this from double-navigating with the tap listener.
 */
export async function routeFromLaunchNotification(): Promise<void> {
  if (!deps || !deps.notifications) return;
  try {
    const last = await deps.notifications.getLastNotificationResponseAsync();
    if (last) {
      routeToResolve(last.notification.request);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] cold-start deep link failed:', e);
  }
}

/**
 * Registers the reminder category so iOS shows REMINDER_PLACEHOLDER instead of
 * the prediction title when previews are hidden. Best-effort: a failure here
 * leaves the reminder working with the system's generic placeholder.
 */
async function registerCategory(): Promise<void> {
  try {
    await deps?.notifications?.setNotificationCategoryAsync?.(REMINDER_CATEGORY, [], {
      previewPlaceholder: REMINDER_PLACEHOLDER,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] category registration failed:', e);
  }
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

  // Check, don't ask (roadmap step 38). Someone who already allowed
  // notifications sees no change; everyone else is asked in context.
  let granted = false;
  try {
    ({ granted } = await deps.notifications.getPermissionsAsync());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] could not read permission:', e);
  }
  if (!granted) return;
  await activate();
}

/**
 * Notification permission as the UI needs it, without asking. 'unsupported'
 * on web, where there are no local notifications.
 */
export async function reminderPermission(): Promise<ReminderPermission> {
  if (!deps) {
    deps = { notifications: defaultNotificationsApi(), navigator: defaultNavigator() };
  }
  if (!deps.notifications) return 'unsupported';
  try {
    const res = await deps.notifications.getPermissionsAsync();
    if (res.granted) return 'granted';
    if (res.status === 'undetermined' || res.canAskAgain !== false) return 'undetermined';
    return 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Show the system alert, in context (roadmap step 38: after the user taps
 * "Turn on reminders"). On a yes, reminders start for every open prediction.
 */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!deps) {
    deps = { notifications: defaultNotificationsApi(), navigator: defaultNavigator() };
  }
  if (!deps.notifications) return 'unsupported';
  try {
    const { granted } = await deps.notifications.requestPermissionsAsync();
    if (!granted) return 'denied';
    await activate();
    return 'granted';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] permission request failed:', e);
    return await reminderPermission();
  }
}

/**
 * Everything that needs permission: the tap handler, the hidden-preview
 * category, the settings and store subscriptions, and the launch-time
 * reconcile. Runs once, whether permission was already granted at launch or
 * granted later from the in-context prompt.
 */
async function activate(): Promise<void> {
  if (active || !deps || !deps.notifications) return;
  active = true;
  permissionGranted = true;

  installTapHandler();
  await registerCategory();

  // Seed the toggle state and react to future flips. Off cancels everything;
  // on reschedules from pending.
  // Due-day reminders need both switches (roadmap D31).
  const remindersOn = (s: { notificationsEnabled: boolean; remindersEnabled: boolean }) =>
    s.notificationsEnabled && s.remindersEnabled;
  notificationsEnabled = remindersOn(useSettingsStore.getState());
  settingsUnsub = useSettingsStore.subscribe((state, prev) => {
    const next = remindersOn(state);
    if (next === remindersOn(prev)) return;
    void applyEnabled(next);
  });

  // Match the OS to the store before watching for changes, then take the
  // reconciled snapshot as the baseline for the diff.
  await reconcile();
  lastPendingById = new Map(
    usePredictionStore.getState().pending.map((p) => [p.id, p] as const),
  );

  storeUnsub = usePredictionStore.subscribe((state, prev) => {
    if (state.pending === prev.pending) return; // referential equality fast-path
    handleStoreUpdate(state.pending);
  });

  // The cold-start deep link (the tap that launched the app) is handled
  // separately by routeFromLaunchNotification(), which the root layout calls
  // once the navigator has mounted. Doing it here would race that mount.
}

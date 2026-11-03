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
//   3. Once granted, we install the tap handler. A tap on the notification
//      body deep-links to /resolve/[id]. Happened / Didn't (roadmap D8)
//      record that answer first, then open the same screen already resolved.
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
import { useStatsStore } from '@/store/statsStore';

import {
  REMINDER_ACTION_DIDNT,
  REMINDER_ACTION_HAPPENED,
  REMINDER_ACTIONS,
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
    actions: typeof REMINDER_ACTIONS,
    options: { previewPlaceholder: string },
  ): Promise<unknown>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(
    listener: (event: NotificationResponseEvent) => void | Promise<void>,
  ): { remove: () => void };
  /**
   * The notification response that launched the app from a killed state, or
   * null if the app was opened normally. The launching tap (cold start) is
   * read explicitly via this call, including which action button was used.
   * Note that addNotificationResponseReceivedListener may *also* replay the
   * same launching response to a freshly-installed listener, so both paths
   * dedupe on request.identifier to navigate once.
   */
  getLastNotificationResponseAsync(): Promise<NotificationResponseEvent | null>;
}

/** A tap on a notification or one of its actions, as the scheduler reads it. */
export interface NotificationResponseEvent {
  /**
   * The action button, or absent / the platform default when the body was
   * tapped. Happened and Didn't are the only ones that record an answer.
   */
  actionIdentifier?: string;
  notification: {
    request: { identifier: string; content: { data?: Record<string, unknown> } };
  };
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

// Response identifier → the answer it recorded. A cold start can fail to
// navigate (the root layout isn't mounted yet) and then succeed on the retry.
// The retry must still open the resolved state, and must not write again.
const recordedAnswers = new Map<string, 'happened' | 'didnt'>();

// One in-flight record per prediction. A second delivery (the listener and
// the cold-start read, or two taps) waits and does not write.
const actionInFlight = new Map<string, Promise<ActionResult>>();

type ActionResult = 'recorded' | 'unchanged' | 'missing' | 'failed';

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
      return await Notifications.setNotificationCategoryAsync(
        identifier,
        // Our buttons are the SDK's NotificationAction shape (foreground, no text field).
        actions as unknown as Parameters<typeof Notifications.setNotificationCategoryAsync>[1],
        options,
      );
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
  recordedAnswers.clear();
  actionInFlight.clear();
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
 * The default local hour a reminder fires on its due day (roadmap D9, decided
 * 2026-10-05). Due dates are stored at 12:00 local, and a reminder at noon
 * asked "Did it happen?" about "I'll finish the report by Friday" before
 * Friday was over. The evening is when most of a day's outcomes are known.
 * Since D38 (2026-11-01) the person can pick another time in You
 * (`settingsStore.dueReminderTime`, 7:00 PM by default).
 */
export const REMINDER_HOUR = 19;

/** When a prediction's reminder fires: its due day, at the chosen local time. */
export function reminderTimeFor(
  dueIso: string,
  time: { hour: number; minute: number } = useSettingsStore.getState().dueReminderTime,
): Date {
  const at = new Date(dueIso);
  at.setHours(time.hour, time.minute, 0, 0);
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

/** Move every reminder to the chosen time (roadmap D38): cancel, then set again. */
async function rescheduleAll(): Promise<void> {
  if (!deps || !deps.notifications || !permissionGranted || !notificationsEnabled) return;
  for (const predictionId of [...scheduledByPredictionId.keys()]) {
    await cancel(predictionId);
  }
  for (const p of usePredictionStore.getState().pending) await schedule(p);
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
  const predictionId = predictionIdOf(data);
  if (predictionId) return `/resolve/${predictionId}`;
  if (data?.kind === 'practice') return '/practice';
  return null;
}

function predictionIdOf(data: Record<string, unknown> | undefined): string | null {
  const predictionId = data?.predictionId;
  return typeof predictionId === 'string' && predictionId.length > 0 ? predictionId : null;
}

/** Happened / Didn't, or null for a body tap and for any other action. */
function answerSlug(actionIdentifier: string | undefined): 'happened' | 'didnt' | null {
  if (actionIdentifier === REMINDER_ACTION_HAPPENED) return 'happened';
  if (actionIdentifier === REMINDER_ACTION_DIDNT) return 'didnt';
  return null;
}

/**
 * Record a reminder's Happened / Didn't through the store, so the write and
 * the stats recompute stay in one transaction behind `status = 'pending'`.
 * A second delivery for the same prediction waits and does not write.
 * Failures are logged and reported as 'failed'; they never throw.
 */
async function recordReminderAnswer(
  predictionId: string,
  outcome: 'resolved_yes' | 'resolved_no',
): Promise<ActionResult | 'folded'> {
  const running = actionInFlight.get(predictionId);
  if (running) {
    await running;
    return 'folded';
  }
  let settle!: (result: ActionResult) => void;
  const done = new Promise<ActionResult>((resolve) => {
    settle = resolve;
  });
  // Set before any await so a second tap can't slip a second write in.
  actionInFlight.set(predictionId, done);
  try {
    const result = await writeReminderAnswer(predictionId, outcome);
    settle(result);
    return result;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] resolve from reminder failed:', e);
    settle('failed');
    return 'failed';
  } finally {
    if (actionInFlight.get(predictionId) === done) actionInFlight.delete(predictionId);
  }
}

async function writeReminderAnswer(
  predictionId: string,
  outcome: 'resolved_yes' | 'resolved_no',
): Promise<ActionResult> {
  try {
    const before = await usePredictionStore.getState().getById(predictionId);
    if (!before) return 'missing';
    if (before.status !== 'pending') return 'unchanged';
    // A milestone or checkpoint left from an earlier answer belongs to that
    // answer. Clear both so this one celebrates only what it crossed, the
    // same order as answering on the Resolve screen.
    useStatsStore.getState().clearMilestone();
    usePredictionStore.getState().clearStreakCheckpoint();
    await usePredictionStore.getState().resolve(predictionId, outcome);
    const after = await usePredictionStore.getState().getById(predictionId);
    // The SQL guard (`AND status = 'pending'`) makes a lost race a no-op.
    // Only the write that landed opens the resolved state.
    if (after?.status !== outcome) return 'unchanged';
    return 'recorded';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] resolve from reminder failed:', e);
    return 'failed';
  }
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

/**
 * Body tap: open Resolve on the question, as before. Happened / Didn't:
 * record that answer once, then open Resolve already on the acknowledgement
 * (`?answer=happened` or `didnt`). Anything else with a prediction id (an
 * unknown action, a deleted prediction, a second tap) still opens Resolve
 * and does not throw. The claim is taken before the first await so the
 * listener and the cold-start read can't both record.
 */
async function handleResponse(response: NotificationResponseEvent): Promise<void> {
  const request = response.notification.request;
  if (routedResponseIdentifiers.has(request.identifier)) return;

  const slug = answerSlug(response.actionIdentifier);
  const predictionId = predictionIdOf(request.content.data);
  if (!slug || !predictionId) {
    routeToResolve(request);
    return;
  }

  routedResponseIdentifiers.add(request.identifier);
  try {
    let show = recordedAnswers.get(request.identifier) ?? null;
    if (!show) {
      const outcome = slug === 'happened' ? 'resolved_yes' : 'resolved_no';
      const result = await recordReminderAnswer(predictionId, outcome);
      // The other delivery is the one that opens the screen.
      if (result === 'folded') return;
      if (result === 'recorded') {
        recordedAnswers.set(request.identifier, slug);
        show = slug;
      }
    }
    const path = show
      ? `/resolve/${predictionId}?answer=${show}`
      : `/resolve/${predictionId}`;
    deps?.navigator.push(path);
  } catch (e) {
    // The answer, if it landed, is remembered in recordedAnswers, so the
    // retry opens the resolved state and does not write again.
    routedResponseIdentifiers.delete(request.identifier);
    // eslint-disable-next-line no-console
    console.warn('[notifications] action navigation failed:', e);
  }
}

function installTapHandler(): void {
  if (!deps || !deps.notifications) return;
  listenerSub = deps.notifications.addNotificationResponseReceivedListener((event) =>
    handleResponse(event),
  );
}

/**
 * Cold start: when a reminder tap launches the app from a killed state, the
 * runtime listener is installed too late to reliably see it, so we read the
 * launching response explicitly and route from it. The action identifier is
 * read here as well as from the listener; a cold-start Happened / Didn't is
 * lost if only the listener is consulted.
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
    if (last) await handleResponse(last);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] cold-start deep link failed:', e);
  }
}

/**
 * Registers the reminder category: the hidden-preview placeholder, and
 * Happened / Didn't (roadmap D8). The OS looks the category up when a
 * reminder is delivered, so registering it here covers reminders an older
 * build already scheduled — those requests are not cancelled or rewritten
 * just to gain the buttons. A reminder that fires before this version has
 * launched once still opens Resolve from a body tap. Best-effort: a failure
 * leaves the reminder working, without buttons where the platform has none.
 */
async function registerCategory(): Promise<void> {
  try {
    await deps?.notifications?.setNotificationCategoryAsync?.(
      REMINDER_CATEGORY,
      REMINDER_ACTIONS,
      { previewPlaceholder: REMINDER_PLACEHOLDER },
    );
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
    if (next !== remindersOn(prev)) {
      void applyEnabled(next);
      return;
    }
    // A new time (roadmap D38): every reminder moves to it.
    if (state.dueReminderTime !== prev.dueReminderTime && next) void rescheduleAll();
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

// Tests for the L5 notification scheduler.
//
// The scheduler reads from L4 (predictionStore) and a platform-injected
// notifications/router dependency pair. We swap real platform deps for
// in-memory fakes via __setDepsForTests so nothing tries to load
// expo-notifications (a native module) or expo-router (needs a navigator
// context).
//
// Each test bootstraps a clean DB + auth state the same way the rest of the
// suite does, then drives the scheduler through real store actions.

import { Platform } from 'react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';

import {
  __setDepsForTests,
  initNotifications,
  REMINDER_HOUR,
  reminderTimeFor,
  reminderPermission,
  requestReminderPermission,
  routeFromLaunchNotification,
  type NotificationsApi,
  type Navigator,
} from './scheduler';

/** Let fire-and-forget schedule/cancel work settle. */
const flush = () => new Promise((r) => setImmediate(r));

interface ScheduledRecord {
  id: string; // OS identifier we hand back
  title: string;
  body: string;
  data: Record<string, unknown> | undefined;
  date: Date;
}

interface FakeNotifications extends NotificationsApi {
  /** How often the system alert was shown. */
  requestCalls: number;
  /** What the user answers when asked (undetermined fakes). */
  answer: boolean;
  scheduled: Map<string, ScheduledRecord>; // id → record
  cancelled: string[];
  scheduleCalls: number;
  cancelCalls: number;
  /**
   * Fire the tap handler with a given prediction id, as if the user tapped.
   * Pass an explicit identifier to simulate the OS replaying a specific
   * response (e.g. the launching tap) to the runtime listener.
   */
  triggerTap(predictionId: string, identifier?: string): void;
  /** A tap on a notification carrying `data` (the digest's, the practice reminder's). */
  triggerTapData(data: Record<string, unknown>): void;
}

interface FakeNavigator extends Navigator {
  pushed: string[];
}

function makeFakeNotifications(
  granted: boolean,
  options: {
    scheduleThrows?: boolean;
    launchPredictionId?: string;
    /** Not asked yet: the check says no, and asking returns `answer`. */
    undetermined?: { answer: boolean };
  } = {},
): FakeNotifications {
  let tapListener:
    | ((event: {
        notification: {
          request: { identifier: string; content: { data?: Record<string, unknown> } };
        };
      }) => void)
    | null = null;
  let nextId = 1;
  const fake: FakeNotifications = {
    scheduled: new Map(),
    cancelled: [],
    scheduleCalls: 0,
    cancelCalls: 0,
    requestCalls: 0,
    async requestPermissionsAsync() {
      fake.requestCalls++;
      if (options.undetermined) {
        options = { ...options, undetermined: undefined };
        granted = fake.answer;
      }
      return { granted };
    },
    answer: options.undetermined?.answer ?? granted,
    async getPermissionsAsync() {
      if (options.undetermined) return { granted: false, canAskAgain: true, status: 'undetermined' };
      return { granted, canAskAgain: granted, status: granted ? 'granted' : 'denied' };
    },
    async scheduleNotificationAsync(req) {
      fake.scheduleCalls++;
      if (options.scheduleThrows) {
        throw new Error('OS scheduling unavailable');
      }
      const id = `os-${nextId++}`;
      fake.scheduled.set(id, {
        id,
        title: req.content.title,
        body: req.content.body,
        data: req.content.data,
        date: req.trigger.date,
      });
      return id;
    },
    async cancelScheduledNotificationAsync(id) {
      fake.cancelCalls++;
      fake.cancelled.push(id);
      fake.scheduled.delete(id);
    },
    async getAllScheduledNotificationsAsync() {
      return Array.from(fake.scheduled.values()).map((r) => ({
        identifier: r.id,
        content: { data: r.data },
      }));
    },
    setNotificationHandler() {
      /* no-op */
    },
    addNotificationResponseReceivedListener(listener) {
      tapListener = listener;
      return {
        remove: () => {
          tapListener = null;
        },
      };
    },
    triggerTap(predictionId: string, identifier = `tap-${predictionId}-${nextId++}`) {
      if (!tapListener) throw new Error('no tap listener installed');
      tapListener({
        notification: {
          request: {
            identifier,
            content: { data: { predictionId } },
          },
        },
      });
    },
    triggerTapData(data: Record<string, unknown>) {
      if (!tapListener) throw new Error('no tap listener installed');
      tapListener({
        notification: { request: { identifier: `tap-data-${nextId++}`, content: { data } } },
      });
    },
    async getLastNotificationResponseAsync() {
      // Simulates the cold-start launch response: null when the app was
      // opened normally, a response payload when launched by a reminder tap.
      // The identifier is stable so a replayed tap of the same launch dedupes.
      if (!options.launchPredictionId) return null;
      return {
        notification: {
          request: {
            identifier: `launch-${options.launchPredictionId}`,
            content: { data: { predictionId: options.launchPredictionId } },
          },
        },
      };
    },
  };
  return fake;
}

function makeFakeNavigator(): FakeNavigator {
  const pushed: string[] = [];
  return {
    pushed,
    push(path: string) {
      pushed.push(path);
    },
  };
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [] });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
  useSettingsStore.setState({
    notificationsEnabled: true,
    aiRefineEnabled: true,
    hydrated: false,
  });
  await useAuthStore.getState().initialize();
  __setDepsForTests(null); // reset scheduler module state
});

afterEach(() => {
  setDbForTests(null);
  __setDepsForTests(null);
});

describe('scheduler: schedule on create', () => {
  it('schedules a notification when a new pending prediction is created', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship the prototype',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });

    expect(notifications.scheduleCalls).toBe(1);
    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.title).toBe('Did it happen');
    expect(rec.body).toBe('Ship the prototype · You said 50%');
    // Roadmap D9: the evening of the due day, not the stored noon (Jest runs in UTC).
    expect(rec.data).toEqual({ predictionId: p.id, fireAt: '2099-06-01T19:00:00.000Z' });
    expect(rec.date.toISOString()).toBe('2099-06-01T19:00:00.000Z');
  });

  it('trims very long titles to ~80 chars in the body', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    const longTitle = 'a'.repeat(200);
    await usePredictionStore.getState().create({
      title: longTitle,
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });

    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body.length).toBeLessThanOrEqual(80);
  });
});

describe('scheduler: cancel on transition out of pending', () => {
  it('cancels the notification when a prediction is resolved', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    expect(notifications.scheduled.size).toBe(1);
    const scheduledId = Array.from(notifications.scheduled.keys())[0];

    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');

    // Let the fire-and-forget cancel settle.
    await new Promise((r) => setImmediate(r));

    expect(notifications.cancelled).toContain(scheduledId);
    expect(notifications.scheduled.size).toBe(0);
  });

  it('cancels the notification when a prediction is deleted', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    const scheduledId = Array.from(notifications.scheduled.keys())[0];

    await usePredictionStore.getState().remove(p.id);
    await new Promise((r) => setImmediate(r));

    expect(notifications.cancelled).toContain(scheduledId);
    expect(notifications.scheduled.size).toBe(0);
  });
});

// Roadmap D25: an edited due date or title replaces the reminder.
describe('scheduler: reschedule on edit', () => {
  it('moves the reminder to the new due day', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    const oldId = Array.from(notifications.scheduled.keys())[0];

    await usePredictionStore.getState().update(p.id, {
      title: 'Ship it',
      category: 'work',
      due_date: '2099-06-08T12:00:00.000Z',
    });
    await new Promise((r) => setImmediate(r));

    expect(notifications.cancelled).toContain(oldId);
    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.date.toISOString()).toBe('2099-06-08T19:00:00.000Z');
  });

  it('rewrites the reminder when the title changes', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().update(p.id, {
      title: 'Ship the beta',
      category: 'work',
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await new Promise((r) => setImmediate(r));

    expect(notifications.scheduled.size).toBe(1);
    expect(Array.from(notifications.scheduled.values())[0].body).toBe('Ship the beta · You said 50%');
  });

  it('leaves the reminder alone for a category change', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().update(p.id, {
      title: 'Ship it',
      category: 'health',
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await new Promise((r) => setImmediate(r));

    expect(notifications.scheduleCalls).toBe(1);
    expect(notifications.cancelled).toHaveLength(0);
  });
});

describe('scheduler: tap handler', () => {
  it('navigates to /resolve/[id] when a notification is tapped', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    notifications.triggerTap('abc123');
    expect(navigator.pushed).toEqual(['/resolve/abc123']);
  });

  it('ignores taps with no predictionId', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    // Reach into the listener directly with no data — should no-op, not throw.
    // We use triggerTap with an empty string and expect no push.
    expect(() => notifications.triggerTap('')).not.toThrow();
    expect(navigator.pushed).toHaveLength(0);
  });

  // Roadmap step 89: the practice reminder opens today's practice; the
  // digest still opens the app and nothing more.
  it('opens the practice sheet from the practice reminder, and nothing from the digest', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    notifications.triggerTapData({ kind: 'digest' });
    notifications.triggerTapData({ kind: 'practice' });
    expect(navigator.pushed).toEqual(['/practice']);
  });
});

describe('scheduler: cold-start deep link', () => {
  it('routes to /resolve/[id] when a reminder tap launched the app', async () => {
    const notifications = makeFakeNotifications(true, {
      launchPredictionId: 'cold123',
    });
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    // The runtime listener never fired — this came from the launching response,
    // read once the navigator is mounted (the root layout's job in production).
    await routeFromLaunchNotification();
    expect(navigator.pushed).toEqual(['/resolve/cold123']);
  });

  it('does not navigate on a normal launch (no launching response)', async () => {
    const notifications = makeFakeNotifications(true); // getLast… returns null
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    await routeFromLaunchNotification();
    expect(navigator.pushed).toHaveLength(0);
  });

  it('navigates once when the launching tap reaches both the listener and getLast', async () => {
    const notifications = makeFakeNotifications(true, {
      launchPredictionId: 'cold123',
    });
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    // The OS replays the launching response to the freshly-installed listener
    // using the same identifier getLast reports — both must dedupe to one push.
    notifications.triggerTap('cold123', 'launch-cold123');
    await routeFromLaunchNotification();

    expect(navigator.pushed).toEqual(['/resolve/cold123']);
  });

  it('does not record the response id when the navigator push fails, so a retry can route', async () => {
    const notifications = makeFakeNotifications(true, {
      launchPredictionId: 'cold123',
    });
    let throwOnce = true;
    const navigator: FakeNavigator = {
      pushed: [],
      push(path: string) {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('navigate before mounting the Root Layout');
        }
        navigator.pushed.push(path);
      },
    };
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    await routeFromLaunchNotification(); // push throws, id NOT recorded
    expect(navigator.pushed).toHaveLength(0);

    await routeFromLaunchNotification(); // retry succeeds
    expect(navigator.pushed).toEqual(['/resolve/cold123']);
  });
});

describe('scheduler: permission denied', () => {
  it('no-ops on every operation when permission is denied', async () => {
    const notifications = makeFakeNotifications(false); // denied
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await initNotifications();

    // The store still works; the scheduler simply doesn't schedule anything.
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    expect(notifications.scheduleCalls).toBe(0);

    // Resolving still succeeds end-to-end.
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect(usePredictionStore.getState().resolved).toHaveLength(1);

    warnSpy.mockRestore();
  });
});

describe('scheduler: web platform', () => {
  it('no-ops silently on web', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      // null notifications mirrors what defaultNotificationsApi() returns on web.
      const navigator = makeFakeNavigator();
      __setDepsForTests({ notifications: null, navigator });

      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await initNotifications();

      // Single startup debug log; no warnings.
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();

      // The store continues to work end-to-end. Creating + resolving must not
      // throw and must not produce any further notifications-related logs.
      const p = await usePredictionStore.getState().create({
        title: 'Ship it',
        category: 'work',
        confidence: 50,
        due_date: '2099-06-01T12:00:00.000Z',
      });
      await usePredictionStore.getState().resolve(p.id, 'resolved_yes');

      expect(warnSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});

describe('scheduler: notifications toggle (kill-switch)', () => {
  it('cancels all scheduled reminders when notifications are turned off', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    await usePredictionStore.getState().create({
      title: 'A',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().create({
      title: 'B',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-02T12:00:00.000Z',
    });
    await flush();
    expect(notifications.scheduled.size).toBe(2);

    useSettingsStore.setState({ notificationsEnabled: false });
    await flush();

    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.cancelled).toHaveLength(2);
  });

  it('does not schedule new reminders while notifications are off', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    useSettingsStore.setState({ notificationsEnabled: false });
    await flush();

    await usePredictionStore.getState().create({
      title: 'While off',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await flush();

    expect(notifications.scheduleCalls).toBe(0);
  });

  it('reschedules for current pending when notifications are turned back on', async () => {
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    // Created while off → not scheduled yet.
    useSettingsStore.setState({ notificationsEnabled: false });
    await flush();
    await usePredictionStore.getState().create({
      title: 'Pending through the toggle',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await flush();
    expect(notifications.scheduled.size).toBe(0);

    // Turning on reschedules everything currently pending.
    useSettingsStore.setState({ notificationsEnabled: true });
    await flush();

    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toBe('Pending through the toggle · You said 50%');
  });

  it('honors an off toggle that was set before init (never schedules)', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    const notifications = makeFakeNotifications(true);
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    await initNotifications();

    await usePredictionStore.getState().create({
      title: 'Off from the start',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await flush();

    expect(notifications.scheduleCalls).toBe(0);
  });
});

describe('scheduler: schedule failure is non-fatal', () => {
  it('swallows scheduling errors so the create flow still succeeds', async () => {
    const notifications = makeFakeNotifications(true, { scheduleThrows: true });
    const navigator = makeFakeNavigator();
    __setDepsForTests({ notifications, navigator });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await initNotifications();

    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });

    // Let the fire-and-forget schedule attempt settle.
    await new Promise((r) => setImmediate(r));

    expect(p.id).toBeTruthy();
    expect(notifications.scheduleCalls).toBe(1); // we tried
    expect(notifications.scheduled.size).toBe(0); // and failed
    expect(warnSpy).toHaveBeenCalled(); // and logged

    warnSpy.mockRestore();
  });
});

// DESIGN_SYSTEM §7.15: people who hide previews get a generic line, not a
// prediction title that may be about their health or money.
describe('scheduler: hidden-preview placeholder', () => {
  it('registers the reminder category and tags each reminder with it', async () => {
    const notifications = makeFakeNotifications(true);
    const setCategory = jest.fn(async () => undefined);
    notifications.setNotificationCategoryAsync = setCategory;
    const schedule = jest.spyOn(notifications, 'scheduleNotificationAsync');
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();

    expect(setCategory).toHaveBeenCalledWith('calibrate-resolution-reminder', [], {
      previewPlaceholder: 'A prediction is ready to resolve',
    });

    await usePredictionStore.getState().create({
      title: 'See the doctor',
      category: 'health',
      confidence: 60,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    expect(schedule.mock.calls[0][0].content.categoryIdentifier).toBe(
      'calibrate-resolution-reminder',
    );
  });

  it('still schedules reminders if category registration fails', async () => {
    const notifications = makeFakeNotifications(true);
    notifications.setNotificationCategoryAsync = jest.fn(async () => {
      throw new Error('no categories here');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();

    await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    expect(notifications.scheduleCalls).toBe(1);
    warn.mockRestore();
  });
});

// Roadmap step 37: the OS keeps reminders across launches; the id map doesn't.
describe('scheduler: launch-time reconcile', () => {
  /** A reminder left by an earlier session, as the OS would report it. */
  function leftOver(
    notifications: FakeNotifications,
    identifier: string,
    data: Record<string, unknown>,
  ): void {
    notifications.scheduled.set(identifier, {
      id: identifier,
      title: 'Did it happen',
      body: 'from an earlier session',
      data,
      date: new Date('2099-06-01T12:00:00.000Z'),
    });
  }

  async function openPrediction(due = '2099-06-01T12:00:00.000Z') {
    // Created before init, as on a relaunch: the scheduler isn't watching yet.
    return await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 60,
      due_date: due,
    });
  }

  it("adopts an earlier session's reminder, so resolving still cancels it", async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    const p = await openPrediction();
    leftOver(notifications, 'os-old', { predictionId: p.id, fireAt: '2099-06-01T19:00:00.000Z' });

    await initNotifications();
    expect(notifications.scheduleCalls).toBe(0);

    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    await flush();
    expect(notifications.cancelled).toEqual(['os-old']);
  });

  it('cancels reminders for predictions that are no longer open, and duplicates', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    const p = await openPrediction();
    leftOver(notifications, 'os-keep', { predictionId: p.id, fireAt: '2099-06-01T19:00:00.000Z' });
    leftOver(notifications, 'os-dupe', { predictionId: p.id, fireAt: '2099-06-01T19:00:00.000Z' });
    leftOver(notifications, 'os-gone', { predictionId: 'resolved-on-another-phone' });

    await initNotifications();
    expect(notifications.cancelled.sort()).toEqual(['os-dupe', 'os-gone']);
    expect([...notifications.scheduled.keys()]).toEqual(['os-keep']);
  });

  it('cancels every reminder of ours when reminders are off, but not the digest', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    const p = await openPrediction();
    leftOver(notifications, 'os-reminder', { predictionId: p.id });
    leftOver(notifications, 'calibrate-weekly-digest', { kind: 'digest' });

    await initNotifications();
    expect(notifications.cancelled).toEqual(['os-reminder']);
    expect(notifications.scheduled.has('calibrate-weekly-digest')).toBe(true);
    expect(notifications.scheduleCalls).toBe(0);
  });

  it('backfills an open prediction with no reminder, but never one already due', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    const future = await openPrediction('2099-06-01T12:00:00.000Z');
    await openPrediction('2020-01-01T12:00:00.000Z'); // overdue: on Home already

    await initNotifications();
    const scheduled = Array.from(notifications.scheduled.values());
    expect(scheduled.map((r) => r.data)).toEqual([
      { predictionId: future.id, fireAt: '2099-06-01T19:00:00.000Z' },
    ]);
  });

  // Roadmap D9: reminders from before the move fired at noon. A relaunch sets
  // them again for the evening instead of letting the noon one fire.
  it('replaces a reminder set for another time with an evening one', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    const p = await openPrediction();
    leftOver(notifications, 'os-noon', { predictionId: p.id });
    leftOver(notifications, 'os-stale', { predictionId: p.id, fireAt: '2099-06-01T12:00:00.000Z' });

    await initNotifications();
    expect(notifications.cancelled.sort()).toEqual(['os-noon', 'os-stale']);
    const scheduled = Array.from(notifications.scheduled.values());
    expect(scheduled.map((r) => r.date.toISOString())).toEqual(['2099-06-01T19:00:00.000Z']);
  });
});

describe('reminderTimeFor (roadmap D9)', () => {
  it('fires at 19:00 local on the due day', () => {
    expect(reminderTimeFor('2099-06-01T12:00:00.000Z').toISOString()).toBe('2099-06-01T19:00:00.000Z');
    expect(REMINDER_HOUR).toBe(19);
  });

  it('keeps the due day even when the stored time is early in it', () => {
    expect(reminderTimeFor('2099-06-01T00:30:00.000Z').toISOString()).toBe('2099-06-01T19:00:00.000Z');
  });
});

// Roadmap step 38: never ask at launch; ask when the user turns reminders on.
describe('scheduler: permission in context', () => {
  it('never shows the system alert at launch', async () => {
    const notifications = makeFakeNotifications(false, { undetermined: { answer: true } });
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();
    expect(notifications.requestCalls).toBe(0);
    expect(await reminderPermission()).toBe('undetermined');
  });

  it('asks on request, then schedules for everything already open', async () => {
    const notifications = makeFakeNotifications(false, { undetermined: { answer: true } });
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 60,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    expect(notifications.scheduleCalls).toBe(0);

    expect(await requestReminderPermission()).toBe('granted');
    expect(notifications.requestCalls).toBe(1);
    expect(Array.from(notifications.scheduled.values()).map((r) => r.data)).toEqual([
      { predictionId: p.id, fireAt: '2099-06-01T19:00:00.000Z' },
    ]);

    // And from then on it watches the store as usual.
    await usePredictionStore.getState().create({
      title: 'Another',
      category: 'work',
      confidence: 40,
      due_date: '2099-06-02T12:00:00.000Z',
    });
    expect(notifications.scheduled.size).toBe(2);
  });

  it('reports a refusal, and schedules nothing', async () => {
    const notifications = makeFakeNotifications(false, { undetermined: { answer: false } });
    __setDepsForTests({ notifications, navigator: makeFakeNavigator() });
    await initNotifications();
    expect(await requestReminderPermission()).toBe('denied');
    expect(await reminderPermission()).toBe('denied');
    expect(notifications.scheduleCalls).toBe(0);
  });

  it('is unsupported on web', async () => {
    __setDepsForTests({ notifications: null, navigator: makeFakeNavigator() });
    expect(await reminderPermission()).toBe('unsupported');
    expect(await requestReminderPermission()).toBe('unsupported');
  });
});

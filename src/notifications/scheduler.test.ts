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
}

interface FakeNavigator extends Navigator {
  pushed: string[];
}

function makeFakeNotifications(
  granted: boolean,
  options: { scheduleThrows?: boolean; launchPredictionId?: string } = {},
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
    async requestPermissionsAsync() {
      return { granted };
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
      due_date: '2026-06-01T12:00:00.000Z',
    });

    expect(notifications.scheduleCalls).toBe(1);
    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.title).toBe('Did it happen?');
    expect(rec.body).toBe('Ship the prototype');
    expect(rec.data).toEqual({ predictionId: p.id });
    expect(rec.date.toISOString()).toBe('2026-06-01T12:00:00.000Z');
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
      due_date: '2026-06-01T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
    });
    const scheduledId = Array.from(notifications.scheduled.keys())[0];

    await usePredictionStore.getState().remove(p.id);
    await new Promise((r) => setImmediate(r));

    expect(notifications.cancelled).toContain(scheduledId);
    expect(notifications.scheduled.size).toBe(0);
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
      due_date: '2026-06-01T12:00:00.000Z',
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
        due_date: '2026-06-01T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().create({
      title: 'B',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-02T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
    });
    await flush();
    expect(notifications.scheduled.size).toBe(0);

    // Turning on reschedules everything currently pending.
    useSettingsStore.setState({ notificationsEnabled: true });
    await flush();

    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toBe('Pending through the toggle');
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
      due_date: '2026-06-01T12:00:00.000Z',
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
      due_date: '2026-06-01T12:00:00.000Z',
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

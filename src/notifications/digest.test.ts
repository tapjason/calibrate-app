// Tests for the L5 weekly digest scheduler.
//
// Same shape as scheduler.test.ts: we swap the platform notifications adapter
// for an in-memory fake via __setDepsForTests so nothing tries to load
// expo-notifications. Each test drives the digest through real predictionStore
// actions to exercise the subscribe path end-to-end.

import { Platform } from 'react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';

import {
  __setDepsForTests,
  initDigest,
  type DigestNotificationsApi,
} from './digest';

/** Let fire-and-forget schedule/cancel work settle. */
const flush = () => new Promise((r) => setImmediate(r));

interface ScheduledRecord {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, unknown> | undefined;
  weekday: number;
  hour: number;
  minute: number;
}

interface FakeDigestNotifications extends DigestNotificationsApi {
  scheduled: Map<string, ScheduledRecord>; // identifier → record
  cancelled: string[];
  scheduleCalls: number;
  cancelCalls: number;
}

function makeFakeNotifications(
  granted: boolean,
  options: { scheduleThrows?: boolean } = {},
): FakeDigestNotifications {
  const fake: FakeDigestNotifications = {
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
      // Mirror the real SDK: passing an existing identifier replaces it.
      fake.scheduled.set(req.identifier, {
        identifier: req.identifier,
        title: req.content.title,
        body: req.content.body,
        data: req.content.data,
        weekday: req.trigger.weekday,
        hour: req.trigger.hour,
        minute: req.trigger.minute,
      });
      return req.identifier;
    },
    async cancelScheduledNotificationAsync(id) {
      fake.cancelCalls++;
      fake.cancelled.push(id);
      fake.scheduled.delete(id);
    },
  };
  return fake;
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
  __setDepsForTests(null);
});

afterEach(() => {
  setDbForTests(null);
  __setDepsForTests(null);
});

describe('digest: initial schedule', () => {
  it('schedules a Sunday-evening weekly notification on init', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    expect(notifications.scheduleCalls).toBe(1);
    expect(notifications.scheduled.size).toBe(1);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.weekday).toBe(1); // Sunday
    expect(rec.hour).toBe(18);
    expect(rec.minute).toBe(0);
    expect(rec.title).toBe('Weekly check-in');
    expect(rec.data).toEqual({ kind: 'digest' });
  });

  it('uses a zero-state body when there are no pending predictions', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toMatch(/No open predictions/i);
  });

  it('reflects the current pending count in the body at init', async () => {
    // Create two predictions BEFORE initializing the digest.
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

    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toBe('You have 2 open predictions. Tap to check in.');
  });
});

describe('digest: re-schedule on pending count change', () => {
  it('refreshes the body when a prediction is created', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    expect(notifications.scheduleCalls).toBe(1);

    await usePredictionStore.getState().create({
      title: 'New one',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T12:00:00.000Z',
    });

    // Let the fire-and-forget reschedule settle.
    await new Promise((r) => setImmediate(r));

    expect(notifications.scheduleCalls).toBe(2);
    expect(notifications.scheduled.size).toBe(1); // same identifier, replaced
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toBe('You have 1 open prediction. Tap to check in.');
  });

  it('refreshes the body when a pending prediction resolves', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T12:00:00.000Z',
    });

    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    // Init scheduled once with count = 1.
    expect(notifications.scheduleCalls).toBe(1);
    expect(Array.from(notifications.scheduled.values())[0].body).toMatch(
      /1 open prediction/,
    );

    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    await new Promise((r) => setImmediate(r));

    expect(notifications.scheduleCalls).toBe(2);
    const [rec] = Array.from(notifications.scheduled.values());
    expect(rec.body).toMatch(/No open predictions/i);
  });

  it('does not reschedule when the pending count is unchanged', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    const initialCalls = notifications.scheduleCalls;

    // Trigger a store update that doesn't change the pending count (loading
    // resolved doesn't touch pending at all).
    await usePredictionStore.getState().loadResolved();
    await new Promise((r) => setImmediate(r));

    expect(notifications.scheduleCalls).toBe(initialCalls);
  });
});

describe('digest: permission denied', () => {
  it('schedules nothing when permission is denied, store still works', async () => {
    const notifications = makeFakeNotifications(false);
    __setDepsForTests({ notifications });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await initDigest();
    expect(notifications.scheduleCalls).toBe(0);

    // Subsequent store changes must not attempt to schedule either.
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T12:00:00.000Z',
    });
    await new Promise((r) => setImmediate(r));
    expect(notifications.scheduleCalls).toBe(0);

    // And the core loop is unaffected.
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect(usePredictionStore.getState().resolved).toHaveLength(1);

    warnSpy.mockRestore();
  });
});

describe('digest: web platform', () => {
  it('no-ops silently on web', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
    try {
      __setDepsForTests({ notifications: null });

      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await initDigest();

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();

      // Store ops continue to work without producing digest-related logs.
      await usePredictionStore.getState().create({
        title: 'Ship it',
        category: 'work',
        confidence: 50,
        due_date: '2026-06-01T12:00:00.000Z',
      });
      await new Promise((r) => setImmediate(r));

      expect(warnSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
    }
  });
});

describe('digest: schedule failure is non-fatal', () => {
  it('swallows scheduling errors so the create flow still succeeds', async () => {
    const notifications = makeFakeNotifications(true, { scheduleThrows: true });
    __setDepsForTests({ notifications });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await initDigest();

    // Init's schedule attempt threw — and we logged it.
    expect(notifications.scheduleCalls).toBe(1);
    expect(notifications.scheduled.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();

    // Despite the failure, the core loop is unaffected.
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T12:00:00.000Z',
    });
    expect(p.id).toBeTruthy();

    warnSpy.mockRestore();
  });
});

describe('digest: notifications toggle (kill-switch)', () => {
  it('cancels the standing digest when notifications are turned off', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();
    expect(notifications.scheduled.size).toBe(1);

    useSettingsStore.setState({ notificationsEnabled: false });
    await flush();

    expect(notifications.cancelled).toContain('calibrate-weekly-digest');
    expect(notifications.scheduled.size).toBe(0);
  });

  it('reschedules the digest when notifications are turned back on', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    useSettingsStore.setState({ notificationsEnabled: false });
    await flush();
    expect(notifications.scheduled.size).toBe(0);

    useSettingsStore.setState({ notificationsEnabled: true });
    await flush();

    expect(notifications.scheduled.size).toBe(1);
  });

  it('schedules nothing on init when notifications are off', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });
    await initDigest();

    expect(notifications.scheduleCalls).toBe(0);
  });
});

describe('digest: idempotent init', () => {
  it('subsequent initDigest calls are no-ops', async () => {
    const notifications = makeFakeNotifications(true);
    __setDepsForTests({ notifications });

    await initDigest();
    await initDigest();
    await initDigest();

    expect(notifications.scheduleCalls).toBe(1);
  });
});

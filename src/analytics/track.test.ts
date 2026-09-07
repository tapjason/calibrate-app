import { setDbForTests } from '@/db/client';
import {
  countUnsyncedEvents,
  enqueueEvent,
  listUnsyncedEvents,
  trimQueue,
  TRIM_INTERVAL,
  __setQueueCapForTests,
} from '@/db/analytics';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

import { EVENT_NAMES, sanitizeProps } from './events';
import { track } from './track';

const USER = 'user-1';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.setState({ userId: USER, email: null, status: 'authenticated' });
  useSettingsStore.setState({ analyticsEnabled: true });
});

afterEach(() => {
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('track', () => {
  it('queues an event with its declared properties', async () => {
    await track('share_completed', { surface: 'card' });

    const [event] = await listUnsyncedEvents(10);
    expect(event).toMatchObject({
      user_id: USER,
      name: 'share_completed',
      props: { surface: 'card' },
    });
    expect(Date.parse(event.created_at)).not.toBeNaN();
  });

  it('records nothing when the user has opted out', async () => {
    useSettingsStore.setState({ analyticsEnabled: false });

    await track('prediction_logged', { confidence: 70 });

    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  // Events before sign-in have no owner and could not be scoped server-side.
  it('records nothing before an identity exists', async () => {
    useAuthStore.setState({ userId: null, email: null, status: 'loading' });

    await track('warmup_started');

    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  // Analytics is the least important thing in the app. It must not be able to
  // throw into a save, a render, or a resolution.
  it('never throws, even with no database at all', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    setDbForTests(null);

    await expect(track('prediction_logged', { confidence: 50 })).resolves.toBeUndefined();
  });

  it('gives every event a distinct id', async () => {
    await track('warmup_started');
    await track('warmup_started');

    const events = await listUnsyncedEvents(10);
    expect(events).toHaveLength(2);
    expect(events[0].id).not.toBe(events[1].id);
  });
});

describe('the property whitelist', () => {
  // The pipe carries counters, not content. This is the guard that makes
  // "we never send your predictions" a structural claim rather than a promise.
  it('drops properties the event does not declare', () => {
    const props = sanitizeProps('share_completed', {
      surface: 'card',
      title: 'I will ship on Friday',
    } as never);

    expect(props).toEqual({ surface: 'card' });
  });

  it('drops strings that are not declared enum values', () => {
    expect(sanitizeProps('paywall_viewed', { source: 'anything' } as never)).toEqual({});
    expect(sanitizeProps('paywall_viewed', { source: 'settings' })).toEqual({
      source: 'settings',
    });
  });

  it('drops non-finite numbers', () => {
    expect(sanitizeProps('prediction_logged', { confidence: NaN })).toEqual({});
    expect(sanitizeProps('prediction_logged', { confidence: Infinity })).toEqual({});
    expect(sanitizeProps('prediction_logged', { confidence: 70 })).toEqual({
      confidence: 70,
    });
  });

  it('keeps booleans', () => {
    expect(
      sanitizeProps('prediction_logged', { confidence: 50, integrity_bonus: true }),
    ).toEqual({ confidence: 50, integrity_bonus: true });
  });

  it('accepts an absent property bag', () => {
    expect(sanitizeProps('warmup_started', undefined)).toEqual({});
  });

  it('declares props for every event name', () => {
    for (const name of EVENT_NAMES) {
      expect(() => sanitizeProps(name, {})).not.toThrow();
    }
  });
});

describe('the queue is bounded', () => {
  afterEach(() => __setQueueCapForTests(null));

  // An install that never gets network would otherwise grow this table
  // forever. Recent behavior is what the metrics are about, so the oldest go.
  it('keeps the newest events and drops the rest', async () => {
    await createRows(15);

    await trimQueue(10);

    await expect(countUnsyncedEvents()).resolves.toBe(10);
    const [oldestKept] = await listUnsyncedEvents(1);
    expect(oldestKept.props.confidence).toBe(5);
  });

  // Trimming runs periodically rather than on every insert: logging a
  // prediction must not wait on analytics housekeeping.
  it('trims as events accumulate, without trimming on every insert', async () => {
    __setQueueCapForTests(10);

    await createRows(TRIM_INTERVAL + 5);

    const count = await countUnsyncedEvents();
    expect(count).toBeGreaterThan(10); // overshoot is allowed …
    expect(count).toBeLessThan(TRIM_INTERVAL + 5); // … but a trim did happen
  });
});

/** Write n events with strictly increasing timestamps. */
async function createRows(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await enqueueEvent({
      id: `e${String(i).padStart(6, '0')}`,
      user_id: USER,
      name: 'prediction_logged',
      props: { confidence: i },
      created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    });
  }
}

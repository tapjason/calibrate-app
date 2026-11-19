import { render, screen } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useWarmupStore } from '@/store/warmupStore';
import type { WarmupQuestion } from '@/types';

import WarmupScreen from '../../../app/warmup/index';

import { usageCountsMayGoUp } from './usageNotice';
import { WARMUP_USAGE_NOTE } from './UsageStatsNotice';

// The Warm-up route (app/warmup/index.tsx), D69 (b): the line and switch for
// usage counts sit on its first screen, under the intro and above the first
// question. Tested from here: a test file under app/ could be read as a route.

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
// Queued on the phone, never sent from here: the route only records it.
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => {}) }));

const QUESTIONS: readonly WarmupQuestion[] = [
  { id: 'q1', prompt: 'Which is longer?', options: ['A', 'B'], correctIndex: 1, fact: 'B.' },
  { id: 'q2', prompt: 'Which is deeper?', options: ['C', 'D'], correctIndex: 1, fact: 'D.' },
];

/** What `screen.toJSON()` holds: host elements and their text. */
type JsonNode = { props?: { testID?: unknown }; children?: (JsonNode | string)[] | null };

/** Every testID on screen, in the order a reader (and VoiceOver) meets them. */
function testIdsInOrder(): string[] {
  const ids: string[] = [];
  const walk = (node: JsonNode | JsonNode[] | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const id = node.props?.testID;
    if (typeof id === 'string') ids.push(id);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as unknown as JsonNode | JsonNode[] | null);
  return ids;
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  // Also every setting back to a fresh install's: the line never shown.
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useSettingsStore.setState({ analyticsEnabled: true });
  useAuthStore.setState({ status: 'guest', userId: 'local-user-v1' });
  useWarmupStore.setState({
    questions: QUESTIONS,
    index: 0,
    answers: [],
    result: null,
    completedAt: null,
    hydrated: true,
    pick: null,
  });
});

afterEach(() => {
  __setPersistenceForTests(null);
  setDbForTests(null);
});

describe('the Warm-up route: usage counts (D69 (b))', () => {
  it('says what goes up under the intro and above the first question', () => {
    render(<WarmupScreen />);
    expect(screen.getByTestId('warmup-usage-note')).toHaveTextContent(WARMUP_USAGE_NOTE);

    const ids = testIdsInOrder();
    const intro = ids.indexOf('warmup-intro-body');
    const notice = ids.indexOf('warmup-usage-row');
    const question = ids.indexOf('warmup-prompt');
    const next = ids.indexOf('warmup-next');
    expect(intro).toBeGreaterThanOrEqual(0);
    expect(notice).toBeGreaterThan(intro);
    expect(question).toBeGreaterThan(notice);
    expect(next).toBeGreaterThan(notice);
  });

  it('lets a guest’s counts go up once that screen is drawn, and keeps when', () => {
    expect(usageCountsMayGoUp()).toBe(false);
    render(<WarmupScreen />);
    expect(usageCountsMayGoUp()).toBe(true);
    expect(useSettingsStore.getState().usageNoticeShownAt).not.toBeNull();
  });

  // The intro, and the line with it, are the first question's only.
  it('is not repeated on later questions', () => {
    useWarmupStore.setState({ index: 1, answers: [{ confidence: 70, correct: true }] });
    render(<WarmupScreen />);
    expect(screen.queryByTestId('warmup-usage-row')).toBeNull();
    expect(screen.queryByTestId('warmup-intro-body')).toBeNull();
    // A later question doesn't stand in for having seen it.
    expect(usageCountsMayGoUp()).toBe(false);
  });
});

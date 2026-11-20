import type { SupabaseClient } from '@supabase/supabase-js';

import { track } from '@/analytics/track';
import { supportAsideKey } from '@/engine/supportAside';
import { SUPPORT_ASIDE_MAX_KEYS, type Category, type Prediction, type UserStat } from '@/types';

import { useCoachStore, type CoachRequest } from './coachStore';
import { __setPersistenceForTests, useSettingsStore } from './settingsStore';

// Only what the store records is asserted here; track() itself has its own tests.
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => undefined) }));
const mockTrack = track as jest.MockedFunction<typeof track>;

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 72,
  total_predictions: 50,
  total_resolved: 40,
  current_streak: 2,
  rating_is_provisional: false,
};

let seq = 0;

function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Prediction ${seq}`,
    category: 'finance' as Category,
    confidence: 80,
    created_at: '2026-08-01T00:00:00.000Z',
    due_date: '2026-08-10T00:00:00.000Z',
    status: seq % 2 === 0 ? 'resolved_no' : 'resolved_yes',
    resolved_at: `2026-08-${String(10 + seq).padStart(2, '0')}T00:00:00.000Z`,
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

/** 20 finance resolutions — past MIN_N_CATEGORY, so verdicts are admissible. */
const RESOLVED = Array.from({ length: 20 }, () => prediction());

/** The store's first idle state: the panel shows its ask button. */
const IDLE = {
  insights: [],
  crisisTopic: null,
  loading: false,
  lastAnsweredAt: null,
  lastRequestFailed: false,
  lastFailure: null,
  lastDroppedAll: false,
};

const INSIGHT = {
  type: 'overconfidence',
  category: 'finance',
  message: 'Your finance predictions run overconfident.',
  evidence: 80,
};

function makeClient(impl: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  const calls: string[] = [];
  const client = {
    functions: {
      invoke: async (name: string) => {
        calls.push(name);
        return impl();
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const responds = (data: unknown) => makeClient(async () => ({ data, error: null }));

function request(over: Partial<CoachRequest> = {}): CoachRequest {
  return {
    userStat: USER_STAT,
    resolved: RESOLVED,
    isPlus: true,
    enabled: true,
    ...over,
  };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  seq = 0;
  mockTrack.mockClear();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useCoachStore.setState({
    insights: [],
    crisisTopic: null,
    loading: false,
    lastAnsweredAt: null,
    lastRequestFailed: false,
    lastFailure: null,
    lastDroppedAll: false,
  });
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('coachStore — gating', () => {
  it('makes no request when the Coach toggle is off', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });

    await useCoachStore.getState().requestInsights(request({ enabled: false }), {
      client,
    });

    expect(calls).toHaveLength(0);
    expect(useCoachStore.getState().insights).toEqual([]);
  });

  it('makes no request for a free user', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });

    await useCoachStore.getState().requestInsights(request({ isPlus: false }), {
      client,
    });

    expect(calls).toHaveLength(0);
  });

  // Turning the toggle off has to clear the screen, not just stop refreshing.
  it('clears cached insights when the toggle goes off', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(useCoachStore.getState().insights).toHaveLength(1);

    await useCoachStore.getState().requestInsights(request({ enabled: false }), {
      client,
    });

    expect(useCoachStore.getState().insights).toEqual([]);
  });

  it('does nothing without a UserStat', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request({ userStat: null }), {
      client,
    });
    expect(calls).toHaveLength(0);
  });
});

describe('coachStore — answers', () => {
  it('stores validated insights and stamps the answer time', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });

    await useCoachStore.getState().requestInsights(request(), { client });

    const s = useCoachStore.getState();
    expect(s.insights).toHaveLength(1);
    expect(s.loading).toBe(false);
    expect(s.lastAnsweredAt).not.toBeNull();
    expect(s.lastRequestFailed).toBe(false);
  });

  it('accepts an empty answer as an answer and clears the cache', async () => {
    const withCache = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client: withCache.client,
    });

    const { client } = responds({ insights: [], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    const s = useCoachStore.getState();
    expect(s.insights).toEqual([]);
    expect(s.lastRequestFailed).toBe(false);
  });

  it('drops ungrounded insights before they reach state', async () => {
    const { client } = responds({
      insights: [{ ...INSIGHT, evidence: 999 }],
      safe: true,
    });

    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState().insights).toEqual([]);
  });
});

// Item 12 (2026-11-19): an answer whose insights were all dropped by the
// validators is kept apart from one with none, so the panel can say nothing
// could be backed by the numbers instead of telling someone with 40 answers
// there's nothing worth flagging yet.
describe('coachStore — an answer that lost every insight', () => {
  /** An insight whose evidence matches nothing in the context: dropped here. */
  const UNGROUNDED = { ...INSIGHT, evidence: 999 };

  it('remembers an answer whose insights this app dropped', async () => {
    const { client } = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({
      insights: [],
      lastDroppedAll: true,
      lastRequestFailed: false,
      loading: false,
    });
    expect(useCoachStore.getState().lastAnsweredAt).not.toBeNull();
  });

  it('remembers an answer whose insights the function dropped', async () => {
    const { client } = responds({ insights: [], safe: true, dropped: 2 });
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({ insights: [], lastDroppedAll: true });
  });

  it('is false on an answer that kept an insight', async () => {
    useCoachStore.setState({ lastDroppedAll: true });
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState().insights).toHaveLength(1);
    expect(useCoachStore.getState().lastDroppedAll).toBe(false);
  });

  it('is false on an answer with nothing to say', async () => {
    useCoachStore.setState({ lastDroppedAll: true });
    const { client } = responds({ insights: [], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({ insights: [], lastDroppedAll: false });
  });

  it('is false on the crisis path', async () => {
    const dropped = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client: dropped.client });
    expect(useCoachStore.getState().lastDroppedAll).toBe(true);

    const { client } = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client,
      freetext: ['I want to die'],
    });

    expect(useCoachStore.getState()).toMatchObject({
      crisisTopic: 'self_harm',
      lastDroppedAll: false,
    });
  });

  // A failure keeps what was on screen (§5.8), and the words that went with it.
  it.each([
    [
      'an error response',
      () => makeClient(async () => ({ data: null, error: { message: 'rate limited' } })),
    ],
    [
      'a thrown request',
      () =>
        makeClient(async () => {
          throw new Error('network down');
        }),
    ],
  ])('is left as it was after %s', async (_name, failing) => {
    const dropped = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client: dropped.client });
    expect(useCoachStore.getState().lastDroppedAll).toBe(true);

    await useCoachStore.getState().requestInsights(request(), { client: failing().client });

    expect(useCoachStore.getState()).toMatchObject({
      lastRequestFailed: true,
      lastDroppedAll: true,
    });
  });

  it('is left false after a failure when it was false', async () => {
    const { client } = makeClient(async () => ({ data: null, error: { message: 'rate limited' } }));
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({
      lastRequestFailed: true,
      lastDroppedAll: false,
    });
  });

  it('is cleared by reset', async () => {
    const { client } = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(useCoachStore.getState().lastDroppedAll).toBe(true);

    useCoachStore.getState().reset();

    expect(useCoachStore.getState().lastDroppedAll).toBe(false);
  });

  it('is cleared by a request with the Coach off', async () => {
    const { client } = responds({ insights: [UNGROUNDED], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(useCoachStore.getState().lastDroppedAll).toBe(true);

    await useCoachStore.getState().requestInsights(request({ enabled: false }), { client });

    expect(useCoachStore.getState().lastDroppedAll).toBe(false);
  });
});

// §5.8 — a dropped connection must not blank a surface that had good content.
describe('coachStore — failure keeps the last good answer', () => {
  it('keeps cached insights when the request fails', async () => {
    const good = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client: good.client,
    });
    expect(useCoachStore.getState().insights).toHaveLength(1);

    const { client } = makeClient(async () => ({
      data: null,
      error: { message: 'rate limited' },
    }));
    await useCoachStore.getState().requestInsights(request(), { client });

    const s = useCoachStore.getState();
    expect(s.insights).toHaveLength(1); // still there
    expect(s.lastRequestFailed).toBe(true);
    expect(s.loading).toBe(false);
  });

  it('clears the loading flag on every path', async () => {
    const { client } = makeClient(async () => {
      throw new Error('network down');
    });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(useCoachStore.getState().loading).toBe(false);
  });

  // Step 189: the server's Plus check gets its own words in the panel.
  it('remembers that the server could not confirm Plus (403)', async () => {
    const { client } = makeClient(async () => ({
      data: null,
      error: { message: 'non-2xx', context: { status: 403 } } as { message: string },
    }));
    await useCoachStore.getState().requestInsights(request(), { client });

    const s = useCoachStore.getState();
    expect(s.lastRequestFailed).toBe(true);
    expect(s.lastFailure).toBe('not_entitled');
    expect(s.loading).toBe(false);
  });

  it('names no reason for any other failure', async () => {
    const { client } = makeClient(async () => ({
      data: null,
      error: { message: 'non-2xx', context: { status: 500 } } as { message: string },
    }));
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({
      lastRequestFailed: true,
      lastFailure: null,
    });
  });

  // Step 189: no scored answer means no request, and it is named so the
  // panel can say why. No analytics either: nothing was asked.
  it('names a request that stopped for want of a scored answer', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(
      request({ userStat: { ...USER_STAT, total_resolved: 0 }, resolved: [] }),
      { client },
    );

    const s = useCoachStore.getState();
    expect(calls).toHaveLength(0);
    expect(mockTrack).not.toHaveBeenCalled();
    expect(s).toMatchObject({
      lastRequestFailed: true,
      lastFailure: 'nothing_scored',
      loading: false,
      // Unanswered, so the panel keeps its disclosure as before.
      lastAnsweredAt: null,
    });
  });

  it('records coach_requested only for an answer', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(mockTrack).toHaveBeenCalledWith('coach_requested', { insight_count: 1 });

    mockTrack.mockClear();
    const failing = makeClient(async () => ({
      data: null,
      error: { message: 'non-2xx', context: { status: 403 } } as { message: string },
    }));
    await useCoachStore.getState().requestInsights(request(), { client: failing.client });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('clears the reason once an answer lands', async () => {
    useCoachStore.setState({ lastRequestFailed: true, lastFailure: 'not_entitled' });
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState()).toMatchObject({
      lastRequestFailed: false,
      lastFailure: null,
    });
  });

  it('never rejects into the caller', async () => {
    const { client } = makeClient(async () => {
      throw new Error('boom');
    });
    await expect(
      useCoachStore.getState().requestInsights(request(), { client }),
    ).resolves.toBeUndefined();
  });
});

// §5.5 — the crisis path replaces coaching entirely, cache included.
describe('coachStore — crisis path', () => {
  it('suppresses cached insights and records the topic', async () => {
    const good = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client: good.client,
    });
    expect(useCoachStore.getState().insights).toHaveLength(1);

    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client,
      freetext: ['I want to die'],
    });

    const s = useCoachStore.getState();
    expect(s.insights).toEqual([]);
    expect(s.crisisTopic).toBe('self_harm');
    // And nothing was sent.
    expect(calls).toHaveLength(0);
  });

  it('clears the crisis state on a later clean answer', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client,
      freetext: ['I want to die'],
    });
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

    await useCoachStore.getState().requestInsights(request(), { client });

    expect(useCoachStore.getState().crisisTopic).toBeNull();
  });
});

// The bug this guards: CoachPanel called requestInsights with no deps, so the
// pre-filter scanned an empty array and the whole support-surface path was
// unreachable in the shipped app. The store now derives freetext itself.
describe('coachStore — screens the user’s own words unprompted', () => {
  it('catches distress in a reflection with no freetext passed in', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    const withDistress = [
      ...RESOLVED,
      prediction({ reflection: 'I cannot go on like this' }),
    ];

    await useCoachStore
      .getState()
      .requestInsights(request({ resolved: withDistress }), { client });

    const s = useCoachStore.getState();
    expect(s.crisisTopic).toBe('distress');
    expect(s.insights).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('catches distress written into a title', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    const withDistress = [
      ...RESOLVED,
      prediction({ title: 'I want to die before this ships' }),
    ];

    await useCoachStore
      .getState()
      .requestInsights(request({ resolved: withDistress }), { client });

    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(calls).toHaveLength(0);
  });

  it('leaves ordinary reflections alone', async () => {
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    const ordinary = [...RESOLVED, prediction({ reflection: 'Shipped it early' })];

    await useCoachStore
      .getState()
      .requestInsights(request({ resolved: ordinary }), { client });

    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

// Security review, 2026-11-18: a request still running when the account
// changed (or the Coach was turned off) wrote the previous account's cards, or
// its support screen, after the reset had cleared them.
describe('coachStore — a request that is overtaken while it runs', () => {
  type InvokeResult = { data: unknown; error: { message: string } | null };

  /** A client whose answers arrive only when the test says so, in any order. */
  function heldClient() {
    const pending: Array<(result: InvokeResult) => void> = [];
    let calls = 0;
    const client = {
      functions: {
        invoke: () => {
          calls += 1;
          return new Promise<InvokeResult>((resolve) => pending.push(resolve));
        },
      },
    } as unknown as SupabaseClient;
    return {
      client,
      calls: () => calls,
      answer: (i: number, result: InvokeResult) => pending[i]!(result),
    };
  }

  /** Let the request reach the client before the test moves on. */
  const settle = () => new Promise((r) => setImmediate(r));

  it("writes nothing of the previous account's answer after an account change", async () => {
    const held = heldClient();
    const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    expect(held.calls()).toBe(1);
    expect(useCoachStore.getState().loading).toBe(true);

    // What authStore does when the signed-in account changes.
    useCoachStore.getState().reset();
    held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
    await running;

    expect(useCoachStore.getState()).toMatchObject({
      insights: [],
      crisisTopic: null,
      loading: false,
      lastAnsweredAt: null,
      lastRequestFailed: false,
      lastFailure: null,
      lastDroppedAll: false,
    });
    // Nor is it counted, under whoever is signed in now.
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("writes no support screen for the previous account's words", async () => {
    // The pre-filter answers without the network; the reset still comes
    // between the request starting and its answer being written.
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    const running = useCoachStore.getState().requestInsights(request(), {
      client,
      freetext: ['I want to die'],
    });
    useCoachStore.getState().reset();
    await running;

    expect(calls).toHaveLength(0);
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(useCoachStore.getState().lastAnsweredAt).toBeNull();
  });

  it('writes no failure either, once the account has changed', async () => {
    const held = heldClient();
    const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();

    useCoachStore.getState().reset();
    held.answer(0, { data: null, error: { message: 'non-2xx', context: { status: 403 } } as { message: string } });
    await running;

    expect(useCoachStore.getState()).toMatchObject({
      lastRequestFailed: false,
      lastFailure: null,
      loading: false,
    });
  });

  it('writes nothing after the Coach is turned off in You mid-request', async () => {
    const settings = require('./settingsStore') as typeof import('./settingsStore');
    settings.__setPersistenceForTests({ load: async () => null, save: async () => {} });
    try {
      const held = heldClient();
      const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
      await settle();

      await settings.useSettingsStore.getState().setCoachEnabled(false);
      held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
      await running;

      expect(useCoachStore.getState().insights).toEqual([]);
      expect(useCoachStore.getState().lastAnsweredAt).toBeNull();
      expect(useCoachStore.getState().loading).toBe(false);
      expect(mockTrack).not.toHaveBeenCalled();
    } finally {
      settings.__setPersistenceForTests(null);
    }
  });

  it('writes nothing after a request with the Coach off clears the cards', async () => {
    const held = heldClient();
    const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();

    await useCoachStore.getState().requestInsights(request({ enabled: false }), { client: held.client });
    held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
    await running;

    expect(held.calls()).toBe(1);
    expect(useCoachStore.getState().insights).toEqual([]);
    expect(useCoachStore.getState().loading).toBe(false);
  });

  it("keeps a newer request's answer when an older one lands after it", async () => {
    const held = heldClient();
    const older = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    const newer = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    expect(held.calls()).toBe(2);

    held.answer(1, { data: { insights: [], safe: true }, error: null });
    await newer;
    held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
    await older;

    expect(useCoachStore.getState().insights).toEqual([]);
    expect(useCoachStore.getState().lastRequestFailed).toBe(false);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('coach_requested', { insight_count: 0 });
  });

  // Item 12: whether every insight was dropped is part of the answer, so an
  // overtaken request writes it no more than it writes its cards.
  it("writes no all-dropped mark of the previous account's answer after a reset", async () => {
    const held = heldClient();
    const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();

    useCoachStore.getState().reset();
    held.answer(0, { data: { insights: [], safe: true, dropped: 2 }, error: null });
    await running;

    expect(useCoachStore.getState()).toMatchObject({ lastDroppedAll: false, lastAnsweredAt: null });
  });

  it("keeps a newer answer's all-dropped mark when an older clean answer lands after it", async () => {
    const held = heldClient();
    const older = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    const newer = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();

    held.answer(1, { data: { insights: [], safe: true, dropped: 2 }, error: null });
    await newer;
    held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
    await older;

    expect(useCoachStore.getState()).toMatchObject({ insights: [], lastDroppedAll: true });
  });

  it("keeps a newer clean answer when an older all-dropped one lands after it", async () => {
    const held = heldClient();
    const older = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    const newer = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();

    held.answer(1, { data: { insights: [INSIGHT], safe: true }, error: null });
    await newer;
    held.answer(0, { data: { insights: [], safe: true, dropped: 2 }, error: null });
    await older;

    expect(useCoachStore.getState().insights).toHaveLength(1);
    expect(useCoachStore.getState().lastDroppedAll).toBe(false);
  });

  it('still lands a request made after a reset', async () => {
    useCoachStore.getState().reset();
    const held = heldClient();
    const running = useCoachStore.getState().requestInsights(request(), { client: held.client });
    await settle();
    held.answer(0, { data: { insights: [INSIGHT], safe: true }, error: null });
    await running;

    const s = useCoachStore.getState();
    expect(s.insights).toHaveLength(1);
    expect(s.loading).toBe(false);
    expect(s.lastAnsweredAt).not.toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('coach_requested', { insight_count: 1 });
  });
});

describe('coachStore — reset', () => {
  it('drops everything', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), {
      client,
      freetext: ['I want to die'],
    });
    const before = useCoachStore.getState();
    expect(before.crisisTopic).toBe('self_harm');
    expect(before.lastAnsweredAt).not.toBeNull();

    useCoachStore.getState().reset();

    const s = useCoachStore.getState();
    expect(s.insights).toEqual([]);
    expect(s.lastAnsweredAt).toBeNull();
    expect(s.crisisTopic).toBeNull();
  });

  it('drops the insights of a clean answer', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });
    expect(useCoachStore.getState().insights).toHaveLength(1);

    useCoachStore.getState().reset();

    expect(useCoachStore.getState().insights).toEqual([]);
  });
});

// Main session decision 2026-11-19: an answered prediction can't be deleted
// after its 24 hours, so one false positive of the pre-filter would replace
// the Coach for good. The person can set the card aside; it comes back only
// for new matching words.
describe('coachStore — the support card set aside', () => {
  let saved: Array<{ supportAsideKeys: string[] }>;

  /** An answered prediction whose title trips the filter on its own. */
  const tripping = (id: string, over: Partial<Prediction> = {}) =>
    prediction({ id, title: 'I want to die before this ships', ...over });

  const ask = async (resolved: readonly Prediction[]) => {
    const coach = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request({ resolved }), { client: coach.client });
    return coach.calls;
  };

  const tap = (resolved: readonly Prediction[]) => useCoachStore.getState().backToCoach(resolved);

  const asideKeys = () => useSettingsStore.getState().supportAsideKeys;

  beforeEach(async () => {
    saved = [];
    __setPersistenceForTests({
      load: async () => null,
      save: async (s) => {
        saved.push({ supportAsideKeys: [...(s.supportAsideKeys ?? [])] });
      },
    });
    await useSettingsStore.getState().hydrate();
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  it('shows the card for a tripping prediction, and sends nothing', async () => {
    const calls = await ask([...RESOLVED, tripping('t1')]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(calls).toHaveLength(0);
  });

  it('after setting it aside, goes back to idle, then a new request reaches the Coach', async () => {
    const record = [...RESOLVED, tripping('t1')];
    await ask(record);

    await expect(tap(record)).resolves.toBe('aside');
    // The first idle state: the panel shows its ask button again.
    expect(useCoachStore.getState()).toMatchObject(IDLE);
    // Kept on the phone: one key, no words.
    expect(asideKeys()).toHaveLength(1);
    expect(saved[saved.length - 1]?.supportAsideKeys).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toMatch(/die|ships/);

    const calls = await ask(record);
    expect(calls).toHaveLength(1);
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(useCoachStore.getState().insights).toHaveLength(1);
  });

  it('keeps only the predictions that tripped, each on its own', async () => {
    const record = [...RESOLVED, tripping('t1'), prediction({ id: 'calm', reflection: 'Shipped it early' })];
    await ask(record);
    await expect(tap(record)).resolves.toBe('aside');
    expect(asideKeys()).toEqual([expect.stringMatching(/^t1#[0-9a-f]{16}$/)]);
  });

  it('brings the card back for a second, different tripping prediction', async () => {
    const first = tripping('t1');
    await ask([...RESOLVED, first]);
    await expect(tap([...RESOLVED, first])).resolves.toBe('aside');

    const calls = await ask([...RESOLVED, first, tripping('t2', { title: 'Better off dead than late' })]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(calls).toHaveLength(0);
    // The first is still set aside: the card is for the second.
    expect(asideKeys()).toEqual([expect.stringMatching(/^t1#/)]);
  });

  it("brings it back when the first one's note changes, and its old key goes", async () => {
    const first = tripping('t1');
    await ask([...RESOLVED, first]);
    await tap([...RESOLVED, first]);
    expect(await ask([...RESOLVED, first])).toHaveLength(1);

    await ask([...RESOLVED, { ...first, reflection: 'Took the weekend off' }]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(asideKeys()).toEqual([]);
  });

  it("brings it back when the first one's title changes, and its old key goes", async () => {
    const first = tripping('t1');
    await ask([...RESOLVED, first]);
    await tap([...RESOLVED, first]);

    await ask([...RESOLVED, { ...first, title: 'I want to die before the launch' }]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(asideKeys()).toEqual([]);
  });

  /**
   * `n` answered predictions that trip the filter, in the order the panel
   * holds them: newest answer first, as listResolvedPredictions sorts
   * (`ORDER BY resolved_at DESC`). t0 is the newest.
   */
  const newestFirst = (n: number) => {
    const latest = Date.parse('2026-11-18T20:00:00.000Z');
    return Array.from({ length: n }, (_, i) =>
      tripping(`t${i}`, { resolved_at: new Date(latest - i * 60_000).toISOString() }),
    );
  };

  // Re-review round two, 2026-11-19 (the main session's call): the cap is
  // 2,000, and only guards against a damaged record; each key goes once its
  // words leave the loaded list.
  it(`past the cap of ${SUPPORT_ASIDE_MAX_KEYS}, the newest matching prediction is the one left out, and its card alone comes back`, async () => {
    expect(SUPPORT_ASIDE_MAX_KEYS).toBe(2000);
    const many = newestFirst(SUPPORT_ASIDE_MAX_KEYS + 1);
    await ask(many);
    await expect(tap(many)).resolves.toBe('aside');

    // Added in the list's order, newest first, and the cap keeps the last
    // ones added: every one but the newest.
    expect(asideKeys()).toHaveLength(SUPPORT_ASIDE_MAX_KEYS);
    expect(asideKeys().some((k) => k.startsWith('t0#'))).toBe(false);
    expect(asideKeys()).toContain(supportAsideKey(many[1]!));
    expect(asideKeys()).toContain(supportAsideKey(many[SUPPORT_ASIDE_MAX_KEYS]!));

    // The next request shows the card again, for the newest alone: without
    // it, nothing in the list trips.
    expect(await ask([...RESOLVED, ...many])).toHaveLength(0);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(await ask([...RESOLVED, ...many.slice(1)])).toHaveLength(1);
    expect(useCoachStore.getState().crisisTopic).toBeNull();
  });

  // Until 2026-11-19 the cap was 200: with 201 matching predictions one was
  // always left out, and the card came back at every request.
  it('201 matching predictions are all set aside, and the card stays away on the next request', async () => {
    const many = newestFirst(201);
    const record = [...RESOLVED, ...many];
    await ask(record);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

    await expect(tap(record)).resolves.toBe('aside');
    expect(asideKeys()).toHaveLength(201);
    expect(new Set(asideKeys())).toEqual(new Set(many.map((p) => supportAsideKey(p))));

    const calls = await ask(record);
    expect(calls).toHaveLength(1);
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(useCoachStore.getState().insights).toHaveLength(1);
    // And again: nothing was dropped on the way.
    expect(await ask(record)).toHaveLength(1);
    expect(asideKeys()).toHaveLength(201);
  });

  // Review 2026-11-19: a card no word in the list trips any more (here it
  // came from words passed in) used to stay up with no way back.
  it('clears a card no word in the list trips any more, and sets nothing aside', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client, freetext: ['I want to die'] });
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

    await expect(tap(RESOLVED)).resolves.toBe('cleared');
    expect(useCoachStore.getState()).toMatchObject(IDLE);
    expect(asideKeys()).toEqual([]);
    expect(saved).toHaveLength(0);
  });

  it('still screens words passed in whole, set aside or not', async () => {
    const first = tripping('t1');
    await ask([first]);
    await expect(tap([first])).resolves.toBe('aside');
    const { client, calls } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request({ resolved: [...RESOLVED, first] }), {
      client,
      freetext: [first.title],
    });
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(calls).toHaveLength(0);
  });

  it('lets no request still running write the card back', async () => {
    const record = [...RESOLVED, tripping('t1')];
    await ask(record);
    const { client } = responds({ insights: [INSIGHT], safe: true });
    const running = useCoachStore.getState().requestInsights(request({ resolved: record }), { client });
    await expect(tap(record)).resolves.toBe('aside');
    await running;

    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(useCoachStore.getState().lastAnsweredAt).toBeNull();
  });

  it('records no analytics event and logs no words', async () => {
    const record = [...RESOLVED, tripping('t1', { reflection: 'private note' })];
    await ask(record);
    mockTrack.mockClear();
    warnSpy.mockClear();

    await tap(record);

    expect(mockTrack).not.toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/die|ships|private note/);
  });

  // Fail safe: a record that can't be read holds no set-asides, so the card shows.
  it('shows the card when the settings could not be read', async () => {
    const first = tripping('t1');
    __setPersistenceForTests({
      load: async () => {
        throw new Error('read failed');
      },
      save: async () => {},
    });
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    expect(asideKeys()).toEqual([]);

    const calls = await ask([...RESOLVED, first]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(calls).toHaveLength(0);
  });

  it('a set-aside made while the record cannot be read still holds for this run, unstored', async () => {
    const save = jest.fn(async () => {});
    __setPersistenceForTests({
      load: async () => {
        throw new Error('read failed');
      },
      save,
    });
    await useSettingsStore.getState().hydrate();
    const record = [...RESOLVED, tripping('t1')];
    await ask(record);
    await expect(tap(record)).resolves.toBe('aside');
    expect(await ask(record)).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });
});

// Review 2026-11-19 (HIGH): "Back to Coach" must never set aside words whose
// card the person hasn't been shown. The card stays in memory while words
// come and go under it, so the tap scans the list again first.
describe('coachStore — Back to Coach with words that changed under the card', () => {
  /** distress, the lowest-ranked topic. */
  const distressed = (id: string, over: Partial<Prediction> = {}) =>
    prediction({ id, title: 'Finish the tax return', reflection: 'I cannot go on like this', ...over });
  /** abuse, ranked above distress and below self_harm. */
  const abused = (id: string) => prediction({ id, title: 'Quiet weekend', reflection: 'he hits me when he drinks' });
  /** self_harm, the highest-ranked topic. */
  const selfHarm = (id: string) => prediction({ id, title: 'I want to die before this ships' });

  const ask = async (resolved: readonly Prediction[]) => {
    const coach = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request({ resolved }), { client: coach.client });
    return coach.calls;
  };
  const tap = (resolved: readonly Prediction[]) => useCoachStore.getState().backToCoach(resolved);
  const asideKeys = () => useSettingsStore.getState().supportAsideKeys;
  const asideIds = () => asideKeys().map((k) => k.slice(0, k.indexOf('#'))).sort();

  let saved: number;

  beforeEach(async () => {
    saved = 0;
    __setPersistenceForTests({
      load: async () => null,
      save: async () => {
        saved += 1;
      },
    });
    await useSettingsStore.getState().hydrate();
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  it('a higher-ranked topic added under the card: its card first, nothing set aside; the next tap sets both aside', async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);
    expect(useCoachStore.getState().crisisTopic).toBe('distress');

    // A note like "he hits me when he drinks" is saved or pulled meanwhile.
    const b = abused('b');
    await expect(tap([...RESOLVED, a, b])).resolves.toBe('updated');
    expect(useCoachStore.getState()).toMatchObject({ crisisTopic: 'abuse', insights: [], loading: false });
    expect(asideKeys()).toEqual([]);
    expect(saved).toBe(0);

    await expect(tap([...RESOLVED, a, b])).resolves.toBe('aside');
    expect(asideIds()).toEqual(['a', 'b']);
    expect(useCoachStore.getState()).toMatchObject(IDLE);
  });

  it('the note that put the card up removed: the card goes, nothing stored', async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);
    expect(useCoachStore.getState().crisisTopic).toBe('distress');

    await expect(tap([...RESOLVED, { ...a, reflection: null }])).resolves.toBe('cleared');
    expect(useCoachStore.getState()).toMatchObject(IDLE);
    expect(asideKeys()).toEqual([]);
    expect(saved).toBe(0);
  });

  it('the prediction that put the card up deleted: the card goes, nothing stored', async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);

    await expect(tap(RESOLVED)).resolves.toBe('cleared');
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(asideKeys()).toEqual([]);
  });

  it('a lower-ranked topic added under the card: its card too, before anything is set aside', async () => {
    const a = selfHarm('a');
    await ask([...RESOLVED, a]);
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

    const c = abused('c');
    await expect(tap([...RESOLVED, a, c])).resolves.toBe('updated');
    expect(useCoachStore.getState().crisisTopic).toBe('abuse');
    expect(asideKeys()).toEqual([]);

    // Both topics have been on screen now.
    await expect(tap([...RESOLVED, a, c])).resolves.toBe('aside');
    expect(asideIds()).toEqual(['a', 'c']);
  });

  it('more words of the topic on screen: set aside with the rest at once', async () => {
    const a = selfHarm('a');
    await ask([...RESOLVED, a]);

    const a2 = prediction({ id: 'a2', title: 'Better off dead than late' });
    await expect(tap([...RESOLVED, a, a2])).resolves.toBe('aside');
    expect(asideIds()).toEqual(['a', 'a2']);
  });

  it('a topic already shown under this card counts as shown, whichever card is up now', async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);
    const b = abused('b');
    await expect(tap([...RESOLVED, a, b])).resolves.toBe('updated');

    // B's words go before the next tap: A's distress card was shown first.
    await expect(tap([...RESOLVED, a])).resolves.toBe('aside');
    expect(asideIds()).toEqual(['a']);
  });

  it('a card a request puts up starts afresh: topics shown under an earlier card count for nothing', async () => {
    const a = distressed('a');
    const b = abused('b');
    await ask([...RESOLVED, a]);
    await tap([...RESOLVED, a, b]);
    await tap([...RESOLVED, a, b]);
    expect(asideIds()).toEqual(['a', 'b']);

    // New words: a distress card, then abuse words added under it.
    const c = distressed('c', { title: 'Run the half marathon' });
    await ask([...RESOLVED, a, b, c]);
    expect(useCoachStore.getState().crisisTopic).toBe('distress');
    const d = abused('d');
    await expect(tap([...RESOLVED, a, b, c, d])).resolves.toBe('updated');
    expect(useCoachStore.getState().crisisTopic).toBe('abuse');
    expect(asideIds()).toEqual(['a', 'b']);
  });

  it('a request still running writes nothing over the card a tap put up', async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);
    const { client } = responds({ insights: [INSIGHT], safe: true });
    const running = useCoachStore.getState().requestInsights(request({ resolved: [...RESOLVED, a] }), { client });

    await expect(tap([...RESOLVED, a, abused('b')])).resolves.toBe('updated');
    await running;

    expect(useCoachStore.getState().crisisTopic).toBe('abuse');
  });

  it("a set-aside that can't be made: 'failed', the card stays, nothing stored", async () => {
    const a = distressed('a');
    await ask([...RESOLVED, a]);
    const real = useSettingsStore.getState().addSupportAsideKeys;
    useSettingsStore.setState({
      addSupportAsideKeys: () => {
        throw new Error('storage gone');
      },
    });
    try {
      await expect(tap([...RESOLVED, a])).resolves.toBe('failed');
    } finally {
      useSettingsStore.setState({ addSupportAsideKeys: real });
    }
    expect(useCoachStore.getState().crisisTopic).toBe('distress');
    expect(asideKeys()).toEqual([]);
  });

  it('a tap with no card up shows the card first, never setting aside unseen words', async () => {
    const a = selfHarm('a');
    await expect(tap([...RESOLVED, a])).resolves.toBe('updated');
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(asideKeys()).toEqual([]);
  });

  // Re-review round two, 2026-11-19 (HIGH): one note that matches two topics
  // was judged by its top topic alone, so the tap set it aside after the
  // abuse card and the distress card (988) was never shown.
  describe('one note that matches more than one topic', () => {
    const note = (id: string, reflection: string) => prediction({ id, title: 'Quiet weekend', reflection });

    it('abuse and distress: the abuse card, then the distress card, and only then set aside', async () => {
      const both = note('both', "he hits me when he drinks and I can't go on");
      await ask([...RESOLVED, both]);
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');

      await expect(tap([...RESOLVED, both])).resolves.toBe('updated');
      expect(useCoachStore.getState()).toMatchObject({ crisisTopic: 'distress', insights: [], loading: false });
      expect(asideKeys()).toEqual([]);
      expect(saved).toBe(0);

      await expect(tap([...RESOLVED, both])).resolves.toBe('aside');
      expect(asideIds()).toEqual(['both']);
      expect(useCoachStore.getState()).toMatchObject(IDLE);
    });

    it('typed with the iPhone’s apostrophe, the same', async () => {
      const both = note('both', 'he hits me when he drinks and I can’t go on');
      await ask([...RESOLVED, both]);
      await expect(tap([...RESOLVED, both])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('distress');
      await expect(tap([...RESOLVED, both])).resolves.toBe('aside');
    });

    it('self-harm and abuse: the self-harm card, then the abuse card, and only then set aside', async () => {
      const both = note('both', 'he hits me and I want to die');
      await ask([...RESOLVED, both]);
      expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

      await expect(tap([...RESOLVED, both])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');
      expect(asideKeys()).toEqual([]);

      await expect(tap([...RESOLVED, both])).resolves.toBe('aside');
      expect(asideIds()).toEqual(['both']);
    });

    it('three topics: each card in rank order, one per tap, before anything is set aside', async () => {
      const all = note('all', "I want to die, he hits me, and I can't go on");
      await ask([...RESOLVED, all]);
      expect(useCoachStore.getState().crisisTopic).toBe('self_harm');

      await expect(tap([...RESOLVED, all])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');
      await expect(tap([...RESOLVED, all])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('distress');
      expect(asideKeys()).toEqual([]);
      expect(saved).toBe(0);

      await expect(tap([...RESOLVED, all])).resolves.toBe('aside');
      expect(asideIds()).toEqual(['all']);
    });

    it('a second topic written into the note under the card holds the set-aside back too', async () => {
      const before = note('n', 'he hits me when he drinks');
      await ask([...RESOLVED, before]);
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');

      const after = { ...before, reflection: "he hits me when he drinks and I can't go on" };
      await expect(tap([...RESOLVED, after])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('distress');
      await expect(tap([...RESOLVED, after])).resolves.toBe('aside');
      expect(asideKeys()).toEqual([supportAsideKey(after)]);
    });

    it('the topic on screen counts as shown per topic: a note of it and another topic shown earlier needs no third card', async () => {
      const a = distressed('a');
      const b = abused('b');
      await ask([...RESOLVED, a]);
      await expect(tap([...RESOLVED, a, b])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');

      // Both topics have been shown: a new note with both is set aside with the rest.
      const c = note('c', "he hits me and I can't go on");
      await expect(tap([...RESOLVED, a, b, c])).resolves.toBe('aside');
      expect(asideIds()).toEqual(['a', 'b', 'c']);
    });

    it('the same words split across two predictions: both cards, as before', async () => {
      const a = abused('a');
      const b = distressed('b');
      await ask([...RESOLVED, a, b]);
      expect(useCoachStore.getState().crisisTopic).toBe('abuse');
      await expect(tap([...RESOLVED, a, b])).resolves.toBe('updated');
      expect(useCoachStore.getState().crisisTopic).toBe('distress');
      await expect(tap([...RESOLVED, a, b])).resolves.toBe('aside');
      expect(asideIds()).toEqual(['a', 'b']);
    });
  });
});

// Review 2026-11-19 (privacy): a key holds a hash of the words and says the
// filter matched them, so none outlives the words in the loaded list.
describe('coachStore — set-asides that no longer match the list', () => {
  let saved: StoredKeys[];
  type StoredKeys = string[] | undefined;

  const words = (id: string, title: string, reflection: string | null = null) =>
    prediction({ id, title, reflection });

  beforeEach(async () => {
    saved = [];
    __setPersistenceForTests({
      load: async () => null,
      save: async (s) => {
        saved.push(s.supportAsideKeys);
      },
    });
    await useSettingsStore.getState().hydrate();
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  const keyOf = (p: Prediction) => supportAsideKey(p);

  it('a request drops a key whose prediction is gone or whose words changed, in one write', async () => {
    const same = words('same', 'Same words', 'a note');
    const changed = words('changed', 'Title', 'old note');
    const goneOne = words('gone', 'Deleted since');
    await useSettingsStore.getState().addSupportAsideKeys([keyOf(same), keyOf(changed), keyOf(goneOne)]);
    saved = [];

    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore
      .getState()
      .requestInsights(request({ resolved: [same, { ...changed, reflection: null }] }), { client });

    expect(useSettingsStore.getState().supportAsideKeys).toEqual([keyOf(same)]);
    expect(saved).toEqual([[keyOf(same)]]);
  });

  it('a request with nothing to drop writes nothing', async () => {
    const same = words('same', 'Same words');
    await useSettingsStore.getState().addSupportAsideKeys([keyOf(same)]);
    saved = [];

    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request({ resolved: [...RESOLVED, same] }), { client });

    expect(useSettingsStore.getState().supportAsideKeys).toEqual([keyOf(same)]);
    expect(saved).toEqual([]);
  });

  // An empty list can't be told from one not loaded yet: the keys stay (the
  // safe direction is the card coming back, and an empty list silences nothing).
  it('an empty list leaves the keys as they are', async () => {
    const same = words('same', 'Same words');
    await useSettingsStore.getState().addSupportAsideKeys([keyOf(same)]);
    saved = [];

    await useCoachStore.getState().requestInsights(request({ resolved: [] }), {
      client: responds({ insights: [], safe: true }).client,
    });
    await useCoachStore.getState().backToCoach([]);

    expect(useSettingsStore.getState().supportAsideKeys).toEqual([keyOf(same)]);
    expect(saved).toEqual([]);
  });

  it('a request with the Coach off still drops keys whose words are gone', async () => {
    const goneOne = words('gone', 'Deleted since');
    await useSettingsStore.getState().addSupportAsideKeys([keyOf(goneOne)]);

    await useCoachStore.getState().requestInsights(request({ enabled: false }), {
      client: responds({ insights: [], safe: true }).client,
    });

    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
  });

  it('the tap drops them too, before it scans', async () => {
    const changed = words('changed', 'I want to die before this ships', 'old note');
    await useSettingsStore.getState().addSupportAsideKeys([keyOf(changed)]);
    useCoachStore.setState({ crisisTopic: 'self_harm' });

    // Its note went: its key is stale, so it trips again and is set aside anew.
    const now = { ...changed, reflection: null };
    await expect(useCoachStore.getState().backToCoach([...RESOLVED, now])).resolves.toBe('aside');
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([keyOf(now)]);
  });
});

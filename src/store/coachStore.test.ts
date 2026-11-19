import type { SupabaseClient } from '@supabase/supabase-js';

import { track } from '@/analytics/track';
import type { Category, Prediction, UserStat } from '@/types';

import { useCoachStore, type CoachRequest } from './coachStore';

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

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Category, Prediction, UserStat } from '@/types';

import { selectHasCoachContent, useCoachStore, type CoachRequest } from './coachStore';

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
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useCoachStore.setState({
    insights: [],
    crisisTopic: null,
    loading: false,
    lastAnsweredAt: null,
    lastRequestFailed: false,
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
    expect(selectHasCoachContent(s)).toBe(true);
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
    expect(selectHasCoachContent(s)).toBe(true);
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

describe('coachStore — reset', () => {
  it('drops everything', async () => {
    const { client } = responds({ insights: [INSIGHT], safe: true });
    await useCoachStore.getState().requestInsights(request(), { client });

    useCoachStore.getState().reset();

    const s = useCoachStore.getState();
    expect(s.insights).toEqual([]);
    expect(s.lastAnsweredAt).toBeNull();
    expect(selectHasCoachContent(s)).toBe(false);
  });
});

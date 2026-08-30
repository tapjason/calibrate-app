// fetchCoachInsights must never throw, never call out for a free user, and
// never let distress freetext reach the network. The Supabase client is faked
// end-to-end — the real SDK and the network are never touched.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CoachContext } from '@/types';

import { fetchCoachInsights } from './coach';

const CONTEXT: CoachContext = {
  overall: { calibration_rating: 72, total_resolved: 40 },
  by_category: [
    {
      category: 'finance',
      resolved: 25,
      calibration_score: 61,
      mean_stated_confidence: 80,
      actual_rate: 0.55,
      direction: 'overconfident',
    },
  ],
  patterns: [{ kind: 'weakest_day_score', value: 58 }],
};

const INSIGHT = {
  type: 'overconfidence',
  category: 'finance',
  message: 'Your finance predictions run overconfident — 80% stated, 55% actual.',
  evidence: 80,
};

interface FakeInvokeResult {
  data: unknown;
  error: { message: string } | null;
}

function makeClient(impl: (body: unknown) => Promise<FakeInvokeResult>): {
  client: SupabaseClient;
  calls: Array<{ name: string; body: unknown }>;
} {
  const calls: Array<{ name: string; body: unknown }> = [];
  const client = {
    functions: {
      invoke: async (name: string, opts: { body: unknown }) => {
        calls.push({ name, body: opts.body });
        return impl(opts.body);
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const ok = (data: unknown) => makeClient(async () => ({ data, error: null }));

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('fetchCoachInsights — gating', () => {
  it('makes no request at all for a free user', async () => {
    const { client, calls } = ok({ insights: [INSIGHT], safe: true });

    const out = await fetchCoachInsights(CONTEXT, false, { client });

    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: false });
    expect(calls).toHaveLength(0);
  });

  it('makes no request when nothing has been resolved', async () => {
    const { client, calls } = ok({ insights: [INSIGHT], safe: true });
    const empty: CoachContext = {
      ...CONTEXT,
      overall: { calibration_rating: 0, total_resolved: 0 },
    };

    const out = await fetchCoachInsights(empty, true, { client });

    expect(out.insights).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns empty when Supabase is unavailable', async () => {
    const out = await fetchCoachInsights(CONTEXT, true, { client: null });
    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: false });
  });
});

// COACH_AGENT.md §5.5 — the pre-filter runs BEFORE the coaching call, so
// distress content never becomes coaching input in the first place.
describe('fetchCoachInsights — crisis pre-filter', () => {
  it('suppresses the request entirely when freetext signals distress', async () => {
    const { client, calls } = ok({ insights: [INSIGHT], safe: true });

    const out = await fetchCoachInsights(CONTEXT, true, {
      client,
      freetext: ['Ship the beta', 'I want to die'],
    });

    expect(out.safe).toBe(false);
    expect(out.insights).toEqual([]);
    expect(out.crisisTopic).toBe('self_harm');
    // The load-bearing assertion: nothing left the device.
    expect(calls).toHaveLength(0);
  });

  it('names the topic so the caller can pick the right support resource', async () => {
    const { client } = ok({ insights: [], safe: true });
    const out = await fetchCoachInsights(CONTEXT, true, {
      client,
      freetext: ['I will starve myself until the weigh-in'],
    });
    expect(out.crisisTopic).toBe('eating_disorder');
  });

  it('proceeds normally on ordinary freetext', async () => {
    const { client, calls } = ok({ insights: [INSIGHT], safe: true });

    const out = await fetchCoachInsights(CONTEXT, true, {
      client,
      freetext: ['Ship the beta by Friday'],
    });

    expect(calls).toHaveLength(1);
    expect(out.insights).toHaveLength(1);
  });
});

describe('fetchCoachInsights — happy path', () => {
  it('returns validated insights and calls the coach function', async () => {
    const { client, calls } = ok({ insights: [INSIGHT], safe: true });

    const out = await fetchCoachInsights(CONTEXT, true, { client });

    expect(calls[0].name).toBe('coach');
    expect(calls[0].body).toEqual({ context: CONTEXT });
    expect(out.insights).toHaveLength(1);
    expect(out.crisisTopic).toBeNull();
  });

  // The server validates too, but the client is the last thing between a bad
  // payload and the user's screen.
  it('re-validates the response and drops ungrounded insights', async () => {
    const { client } = ok({
      insights: [{ ...INSIGHT, evidence: 999 }, INSIGHT],
      safe: true,
    });

    const out = await fetchCoachInsights(CONTEXT, true, { client });

    expect(out.insights).toHaveLength(1);
    expect(out.insights[0].evidence).toBe(80);
  });

  it('passes a server-side unsafe verdict through', async () => {
    const { client } = ok({ insights: [], safe: false });
    const out = await fetchCoachInsights(CONTEXT, true, { client });
    expect(out.safe).toBe(false);
  });

  // An empty answer and a missing answer look identical in `insights`, so
  // `ok` is what lets the store tell "nothing to say" from "never ran".
  it('treats zero insights as an ordinary answer, not an absence', async () => {
    const { client } = ok({ insights: [], safe: true });
    const out = await fetchCoachInsights(CONTEXT, true, { client });
    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: true });
  });

  it('marks every failure path as not-ok so the caller can keep its cache', async () => {
    const { client: erroring } = makeClient(async () => ({
      data: null,
      error: { message: 'rate limited' },
    }));
    expect((await fetchCoachInsights(CONTEXT, true, { client: erroring })).ok).toBe(
      false,
    );
    expect((await fetchCoachInsights(CONTEXT, true, { client: null })).ok).toBe(false);
  });
});

describe('fetchCoachInsights — failure modes', () => {
  it('returns empty on an edge function error', async () => {
    const { client } = makeClient(async () => ({
      data: null,
      error: { message: 'rate limited' },
    }));
    const out = await fetchCoachInsights(CONTEXT, true, { client });
    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: false });
  });

  it('returns empty on a malformed body', async () => {
    const { client } = ok('not an object');
    const out = await fetchCoachInsights(CONTEXT, true, { client });
    expect(out.insights).toEqual([]);
  });

  it('returns empty when the request throws', async () => {
    const { client } = makeClient(async () => {
      throw new Error('network down');
    });
    const out = await fetchCoachInsights(CONTEXT, true, { client });
    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: false });
  });

  it('returns empty when the request times out', async () => {
    const { client } = makeClient(
      () => new Promise<FakeInvokeResult>(() => undefined), // never settles
    );
    const out = await fetchCoachInsights(CONTEXT, true, {
      client,
      timeoutMs: 10,
    });
    expect(out).toEqual({ insights: [], safe: true, crisisTopic: null, ok: false });
  });

  it('never throws, whatever the endpoint does', async () => {
    const { client } = makeClient(async () => {
      throw new Error('boom');
    });
    await expect(fetchCoachInsights(CONTEXT, true, { client })).resolves.toBeDefined();
  });
});

// The under-13 rule in the AI clients (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). On a local-only phone the Coach
// and Refine return their empty result before any client is built: tried with
// a Supabase client whose every property access throws, passed in and as the
// app's own.

import type { SupabaseClient } from '@supabase/supabase-js';

import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { setSupabaseClientForTests } from '@/supabase/client';
import type { CoachContext } from '@/types';

import { fetchCoachInsights } from './coach';
import { refinePrediction } from './refine';

const UNDER_13 = { lowerBound: null, upperBound: 12 };

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

const EMPTY = { insights: [], safe: true, crisisTopic: null, ok: false };

/** A client whose every property access throws, and the properties tried. */
function throwingClient(): { client: SupabaseClient; touched: string[] } {
  const touched: string[] = [];
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        touched.push(String(prop));
        throw new Error(`nothing may reach the network here: ${String(prop)}`);
      },
    },
  ) as unknown as SupabaseClient;
  return { client, touched };
}

beforeEach(() => {
  __resetAgeStoreForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetAgeStoreForTests();
  setSupabaseClientForTests(null);
  jest.restoreAllMocks();
});

describe('the Coach under the rule (D70)', () => {
  it('returns the empty result for a Plus user, touching no client', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const passed = throwingClient();
    const own = throwingClient();
    setSupabaseClientForTests(own.client);

    await expect(fetchCoachInsights(CONTEXT, true, { client: passed.client })).resolves.toEqual(EMPTY);
    await expect(fetchCoachInsights(CONTEXT, true)).resolves.toEqual(EMPTY);

    expect(passed.touched).toEqual([]);
    expect(own.touched).toEqual([]);
  });

  // The crisis pre-filter sends nothing, so it still runs: the support
  // surface shows if the Coach is ever asked on such a phone.
  it('still shows the support surface for distress words, sending nothing', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const { client, touched } = throwingClient();

    const out = await fetchCoachInsights(CONTEXT, true, { client, freetext: ['I want to kill myself'] });

    expect(out).toMatchObject({ safe: false, insights: [] });
    expect(out.crisisTopic).not.toBeNull();
    expect(touched).toEqual([]);
  });

  it('without the rule, the same call reaches the client', async () => {
    const { client, touched } = throwingClient();

    await fetchCoachInsights(CONTEXT, true, { client });

    expect(touched).toContain('functions');
  });
});

describe('Refine under the rule (D70)', () => {
  it('returns null, touching no client', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const passed = throwingClient();
    const own = throwingClient();
    setSupabaseClientForTests(own.client);

    await expect(refinePrediction('I will run 5k on Sunday', { client: passed.client })).resolves.toBeNull();
    await expect(refinePrediction('I will run 5k on Sunday')).resolves.toBeNull();

    expect(passed.touched).toEqual([]);
    expect(own.touched).toEqual([]);
  });

  it('without the rule, the same call reaches the client', async () => {
    const { client, touched } = throwingClient();

    await refinePrediction('I will run 5k on Sunday', { client });

    expect(touched).toContain('functions');
  });
});

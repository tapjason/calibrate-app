// refine() must succeed on the happy path and return null silently on every
// failure mode. The Supabase client is faked end-to-end — we never hit the
// real SDK or the network.

import type { SupabaseClient } from '@supabase/supabase-js';

import { refinePrediction } from './refine';

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

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('refinePrediction', () => {
  it('returns the rewritten text on a 2xx response with valid body', async () => {
    const { client, calls } = makeClient(async () => ({
      data: { refined: 'Ship 3 priority tasks before Friday' },
      error: null,
    }));

    const result = await refinePrediction("I'll do better at work this week", {
      client,
    });

    expect(result).toBe('Ship 3 priority tasks before Friday');
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('refine');
    expect(calls[0].body).toEqual({
      prediction: "I'll do better at work this week",
    });
  });

  it('trims the input before sending', async () => {
    const { client, calls } = makeClient(async () => ({
      data: { refined: 'ok' },
      error: null,
    }));

    await refinePrediction('   hello   ', { client });

    expect(calls[0].body).toEqual({ prediction: 'hello' });
  });

  it('returns null when input is empty', async () => {
    const { client, calls } = makeClient(async () => ({
      data: { refined: 'should not get here' },
      error: null,
    }));

    expect(await refinePrediction('', { client })).toBeNull();
    expect(await refinePrediction('   ', { client })).toBeNull();
    expect(calls).toHaveLength(0); // never reached the function
  });

  it('returns null when input exceeds the length cap', async () => {
    const { client, calls } = makeClient(async () => ({
      data: { refined: 'x' },
      error: null,
    }));

    const huge = 'x'.repeat(501);
    expect(await refinePrediction(huge, { client })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when no client is available', async () => {
    expect(await refinePrediction('hello', { client: null })).toBeNull();
  });

  it('returns null and warns when the Edge Function returns an error', async () => {
    const { client } = makeClient(async () => ({
      data: null,
      error: { message: 'server down' },
    }));

    expect(await refinePrediction('hello', { client })).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null when the response body is missing `refined`', async () => {
    const { client } = makeClient(async () => ({
      data: { something_else: 'oops' },
      error: null,
    }));

    expect(await refinePrediction('hello', { client })).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null when `refined` is whitespace-only', async () => {
    const { client } = makeClient(async () => ({
      data: { refined: '   ' },
      error: null,
    }));

    expect(await refinePrediction('hello', { client })).toBeNull();
  });

  it('returns null when invoke throws', async () => {
    const { client } = makeClient(async () => {
      throw new Error('network down');
    });

    expect(await refinePrediction('hello', { client })).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null on timeout', async () => {
    const { client } = makeClient(
      () => new Promise(() => undefined), // never resolves
    );

    const result = await refinePrediction('hello', { client, timeoutMs: 20 });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});

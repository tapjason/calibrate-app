// The under-13 rule in the auth service and the client (roadmap D70,
// 2026-11-19; docs/design/research/under-13-2026-11.md). Defence in depth
// under authStore's own refusal: every exported sign-in and sign-up function
// refuses before any client, nonce or native sheet is touched. The session's
// background refresh is paused and resumed without ever making the client, and
// a client made under the rule starts with it off.

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => {
    throw new Error('the Apple sheet opened');
  }),
  AppleAuthenticationScope: { EMAIL: 0 },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => {
    throw new Error('the web sign-in sheet opened');
  }),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => {
    throw new Error('a nonce was made');
  }),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { __resetAgeStoreForTests, LOCAL_ONLY_SIGN_IN, useAgeStore } from '@/store/ageStore';

import * as auth from './auth';
import { pauseSessionRefresh, refuseWhenLocalOnly, resumeSessionRefresh } from './auth';
import { setSupabaseClientForTests } from './client';

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const REFUSED = { ok: false, error: LOCAL_ONLY_SIGN_IN };

const apple = jest.requireMock('expo-apple-authentication') as { signInAsync: jest.Mock };
const browser = jest.requireMock('expo-web-browser') as { openAuthSessionAsync: jest.Mock };
const crypto = jest.requireMock('expo-crypto') as { getRandomBytesAsync: jest.Mock };

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

/** The service's sign-in and sign-up functions: every exported `sign(In|Up)…`. */
function signInFunctions(): Array<[string, (...args: unknown[]) => Promise<unknown>]> {
  return Object.entries(auth as unknown as Record<string, unknown>)
    .filter(([name, value]) => /^sign(In|Up)/.test(name) && typeof value === 'function')
    .map(([name, value]) => [name, value as (...args: unknown[]) => Promise<unknown>]);
}

/** A client with just the session-refresh calls, recording them. */
function refreshClient() {
  const calls: string[] = [];
  let finishStart: () => void = () => {};
  const started = new Promise<void>((r) => (finishStart = r));
  const client = {
    auth: {
      initialize: jest.fn(async () => {
        calls.push('initialize');
        await started;
        return { error: null };
      }),
      stopAutoRefresh: jest.fn(async () => {
        calls.push('stop');
      }),
      startAutoRefresh: jest.fn(async () => {
        calls.push('start');
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls, finishStart: () => finishStart() };
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  __resetAgeStoreForTests();
  setSupabaseClientForTests(null);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
});

afterEach(() => {
  jest.useRealTimers();
  __resetAgeStoreForTests();
  setSupabaseClientForTests(null);
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  jest.restoreAllMocks();
});

describe('sign-in and sign-up under the rule (D70)', () => {
  it('every exported sign(In|Up) function refuses, touching no client, nonce or sheet', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const fns = signInFunctions();
    expect(fns.map(([name]) => name)).toEqual(
      expect.arrayContaining(['signInWithApple', 'signInWithGoogle', 'signInWithEmail', 'signUpWithEmail']),
    );
    for (const [name, fn] of fns) {
      expect({ name, outcome: await fn('a@b.co', 'A-long-enough-password-1') }).toEqual({ name, outcome: REFUSED });
    }
    expect(touched).toEqual([]);
    expect(apple.signInAsync).not.toHaveBeenCalled();
    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(crypto.getRandomBytesAsync).not.toHaveBeenCalled();
  });

  it('without the rule, the same functions reach the client or the sheet', async () => {
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const outcome = await auth.signInWithEmail('a@b.co', 'A-long-enough-password-1');

    expect(outcome).not.toEqual(REFUSED);
    expect(touched.length).toBeGreaterThan(0);
  });

  it('on a launch that asks, waits for the answer and refuses an under-13 band', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const call = auth.signInWithEmail('a@b.co', 'A-long-enough-password-1');
    await new Promise((r) => setImmediate(r));
    expect(touched).toEqual([]);
    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();

    await expect(call).resolves.toEqual(REFUSED);
    expect(touched).toEqual([]);
  });

  it('waits at most 5 s from when the launch began waiting, then goes on as today', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });

    const waiting = refuseWhenLocalOnly();
    await jest.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void waiting.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toBeNull();
  });

  // authStore waits up to 5 s from the tap first; the service must not add a
  // second wait after it.
  it('adds no second wait once the 5 s have passed', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });
    await jest.advanceTimersByTimeAsync(5_000);

    let settled = false;
    const waiting = refuseWhenLocalOnly().then((v) => {
      settled = true;
      return v;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(waiting).resolves.toBeNull();
  });

  it('resolves at once where the question is not asked', async () => {
    await expect(refuseWhenLocalOnly()).resolves.toBeNull();
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    await expect(refuseWhenLocalOnly()).resolves.toEqual(REFUSED);
  });

  it('leaves sign-out and the Apple re-authentication for deletion open', async () => {
    // Not refused: they remove data. (Their own behaviour is tested elsewhere.)
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    apple.signInAsync.mockResolvedValueOnce({ authorizationCode: 'code-1' });
    crypto.getRandomBytesAsync.mockRejectedValueOnce(new Error('no nonce'));

    await expect(auth.reauthenticateWithApple()).resolves.toBe('code-1');
    expect(apple.signInAsync).toHaveBeenCalledTimes(1);
  });
});

describe("the session's background refresh", () => {
  it('pause and resume never make the client, and never throw without one', async () => {
    await expect(pauseSessionRefresh()).resolves.toBeUndefined();
    await expect(resumeSessionRefresh()).resolves.toBeUndefined();
  });

  it('pause and resume never throw into a caller, whatever the client does', async () => {
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    await expect(pauseSessionRefresh()).resolves.toBeUndefined();
    await expect(resumeSessionRefresh()).resolves.toBeUndefined();
    expect(touched).toContain('auth');
  });

  it("pause waits for the client's own start, then stops the timer", async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);

    const pausing = pauseSessionRefresh();
    await Promise.resolve();
    expect(calls).toEqual(['initialize']);
    finishStart();
    await pausing;

    expect(calls).toEqual(['initialize', 'stop']);
  });

  it('a resume called while a pause waits wins', async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);

    const pausing = pauseSessionRefresh();
    const resuming = resumeSessionRefresh();
    finishStart();
    await Promise.all([pausing, resuming]);

    expect(calls.filter((c) => c !== 'initialize')).toEqual(['start']);
  });

  it('resume does nothing while the rule applies', async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    finishStart();

    await resumeSessionRefresh();

    expect(calls).toEqual(['initialize']);
  });
});

describe('a client made under the rule', () => {
  function makeClientWith(rule: boolean): Record<string, unknown> {
    let options: Record<string, unknown> = {};
    const env = { ...process.env };
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
      jest.doMock('react-native-url-polyfill/auto', () => ({}), { virtual: true });
      jest.doMock('@react-native-async-storage/async-storage', () => ({
        __esModule: true,
        default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
      }));
      jest.doMock('@supabase/supabase-js', () => ({
        createClient: jest.fn((_url: string, _key: string, opts: Record<string, unknown>) => {
          options = opts;
          return { auth: {} };
        }),
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const age = require('@/store/ageStore') as typeof import('@/store/ageStore');
      if (rule) age.useAgeStore.getState().load(UNDER_13, { willAsk: false });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const isolated = require('./client') as typeof import('./client');
      expect(isolated.peekSupabaseClient()).toBeNull();
      isolated.getSupabaseClient();
      expect(isolated.peekSupabaseClient()).not.toBeNull();
    });
    process.env = env;
    return (options.auth ?? {}) as Record<string, unknown>;
  }

  it('starts with the session refresh off', () => {
    expect(makeClientWith(true)).toMatchObject({ autoRefreshToken: false, persistSession: true });
  });

  it('starts with it on otherwise, as before', () => {
    expect(makeClientWith(false)).toMatchObject({ autoRefreshToken: true, persistSession: true });
  });
});

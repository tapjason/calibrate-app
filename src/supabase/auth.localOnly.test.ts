// The under-13 rule in the auth service and the client (roadmap D70,
// 2026-11-19; docs/design/research/under-13-2026-11.md). Defence in depth
// under authStore's own refusal: every exported sign-in and sign-up function
// refuses before any client, nonce or native sheet is touched, refuses for now
// while Apple's answer is still pending after the wait, and asks again once a
// native sheet closes, before anything reaches Supabase. Sign-out and the Apple
// re-authentication for deletion stay open. The session's background refresh
// is paused and resumed without ever making the client, a client made before
// uploads may start begins with it off, and (checked against the installed
// auth-js) starting it later refreshes a session that expired meanwhile.

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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { __resetAgeStoreForTests, LOCAL_ONLY_SIGN_IN, useAgeStore } from '@/store/ageStore';

import * as auth from './auth';
import { AGE_PENDING_SIGN_IN, pauseSessionRefresh, refuseWhenLocalOnly, resumeSessionRefresh } from './auth';
import { setSupabaseClientForTests } from './client';

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const ADULT = { lowerBound: 18, upperBound: null };
const REFUSED = { ok: false, error: LOCAL_ONLY_SIGN_IN };
const PENDING = { ok: false, error: AGE_PENDING_SIGN_IN };

const apple = jest.requireMock('expo-apple-authentication') as { signInAsync: jest.Mock };
const browser = jest.requireMock('expo-web-browser') as { openAuthSessionAsync: jest.Mock };
const crypto = jest.requireMock('expo-crypto') as {
  getRandomBytesAsync: jest.Mock;
  digestStringAsync: jest.Mock;
};

/** Waits (a few turns of the event loop at most) until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) await new Promise((r) => setImmediate(r));
  if (!done()) throw new Error('the condition never held');
}

/** The rule comes on, as Apple's under-13 answer would bring it mid-run. */
function ruleComesOn(): void {
  useAgeStore.getState().load(UNDER_13, { willAsk: false });
}

/** expo-crypto making one good nonce, for a Sign in with Apple that gets as far as the sheet. */
function oneNonce(): void {
  crypto.getRandomBytesAsync.mockResolvedValueOnce(new Uint8Array(32).fill(7));
  crypto.digestStringAsync.mockResolvedValueOnce('a'.repeat(64));
}

/** A client with just the sign-in and sign-out calls the sheets lead to, recording them. */
function signInClient() {
  const clientAuth = {
    signInWithIdToken: jest.fn(async () => ({ data: {}, error: null })),
    signInWithOAuth: jest.fn(async () => ({
      data: { provider: 'google', url: 'https://abcdefghijklmnop.supabase.co/auth/v1/authorize?provider=google' },
      error: null,
    })),
    exchangeCodeForSession: jest.fn(async (_code: string) => ({ data: {}, error: null })),
    signOut: jest.fn(async (_opts?: unknown) => ({ error: null })),
  };
  return { client: { auth: clientAuth } as unknown as SupabaseClient, clientAuth };
}

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

  // Policy audit, 2026-11-19 (item 9): no account goes ahead before the app
  // knows whether the rule applies. Until then it went on as today after 5 s.
  it('waits at most 5 s from when the launch began waiting, then refuses for now while the answer is pending', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });

    const waiting = refuseWhenLocalOnly();
    await jest.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void waiting.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toEqual(PENDING);
  });

  it('pending past the wait, a sign-in is refused for now, touching no client', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const fns = signInFunctions();
    const outcomes = fns.map(([name, fn]) =>
      fn('a@b.co', 'A-long-enough-password-1').then((outcome) => ({ name, outcome })),
    );
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await Promise.all(outcomes)).toEqual(fns.map(([name]) => ({ name, outcome: PENDING })));
    expect(touched).toEqual([]);
    expect(apple.signInAsync).not.toHaveBeenCalled();
    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(crypto.getRandomBytesAsync).not.toHaveBeenCalled();
  });

  it('an answer of 13 or over during the wait lets the sign-in go on', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();
    setSupabaseClientForTests(client);

    const call = auth.signInWithEmail('a@b.co', 'A-long-enough-password-1');
    await new Promise((r) => setImmediate(r));
    expect(touched).toEqual([]);
    await useAgeStore.getState().accept(ADULT);
    useAgeStore.getState().markSettled();

    const outcome = await call;
    expect(outcome).not.toEqual(REFUSED);
    expect(outcome).not.toEqual(PENDING);
    expect(touched.length).toBeGreaterThan(0);
  });

  it('a decline during the wait lets the sign-in go on (no band is today\'s behaviour)', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    const waiting = refuseWhenLocalOnly();
    useAgeStore.getState().markSettled();

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
    await expect(waiting).resolves.toEqual(PENDING);
  });

  it('a launch that never waits for Apple is unchanged: no wait and no refusal', async () => {
    jest.useFakeTimers();
    // Settled from the start: web, Jest, iOS before 26, a stored band of 13
    // or over (its ask runs in the background).
    useAgeStore.getState().load({ lowerBound: 18, upperBound: null }, { willAsk: false });
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

// Review 2026-11-19, item 2: Apple's age answer can land while a sign-in
// sheet is open. Each sheet is followed by the rule's check again, before
// anything reaches Supabase.
describe('a sign-in sheet open when the rule comes on', () => {
  it('Apple: an answer landing while the sheet is up keeps the identity token off Supabase', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    oneNonce();
    apple.signInAsync.mockImplementationOnce(async () => {
      ruleComesOn();
      return { identityToken: 'apple-identity-token', authorizationCode: 'code' };
    });

    await expect(auth.signInWithApple()).resolves.toEqual(REFUSED);

    expect(apple.signInAsync).toHaveBeenCalledTimes(1);
    expect(clientAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('Apple: an answer landing while the nonce is made means the sheet never opens', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    crypto.getRandomBytesAsync.mockImplementationOnce(async () => {
      ruleComesOn();
      return new Uint8Array(32).fill(7);
    });
    crypto.digestStringAsync.mockResolvedValueOnce('a'.repeat(64));

    await expect(auth.signInWithApple()).resolves.toEqual(REFUSED);

    expect(apple.signInAsync).not.toHaveBeenCalled();
    expect(clientAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('Apple, without the rule: the same sign-in reaches Supabase (the test above would see a missing check)', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    oneNonce();
    apple.signInAsync.mockResolvedValueOnce({ identityToken: 'apple-identity-token', authorizationCode: 'code' });

    await expect(auth.signInWithApple()).resolves.toEqual({ ok: true });

    expect(clientAuth.signInWithIdToken).toHaveBeenCalledTimes(1);
  });

  // Supabase has already made (or found) the user at its own callback inside
  // the sheet by then: this keeps the session off the phone and the code
  // unexchanged (a residual).
  it('Google: an answer landing while the sheet is up means the code is never exchanged', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    browser.openAuthSessionAsync.mockImplementationOnce(async () => {
      ruleComesOn();
      return { type: 'success', url: 'fairlysure://google-auth?code=one-time-code' };
    });

    await expect(auth.signInWithGoogle()).resolves.toEqual(REFUSED);

    expect(browser.openAuthSessionAsync).toHaveBeenCalledTimes(1);
    expect(clientAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('Google: an answer landing while the address is built means the sheet never opens', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    clientAuth.signInWithOAuth.mockImplementationOnce(async () => {
      ruleComesOn();
      return {
        data: { provider: 'google', url: 'https://abcdefghijklmnop.supabase.co/auth/v1/authorize?provider=google' },
        error: null,
      };
    });

    await expect(auth.signInWithGoogle()).resolves.toEqual(REFUSED);

    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(clientAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('Google, without the rule: the same sign-in exchanges the code', async () => {
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);
    browser.openAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'fairlysure://google-auth?code=one-time-code',
    });

    await expect(auth.signInWithGoogle()).resolves.toEqual({ ok: true });

    expect(clientAuth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
  });
});

// Review 2026-11-19, item 8: what removes data stays open under the rule, and
// really reaches the client (authStore's own test mocks the service).
describe('what removes data is never refused', () => {
  it.each([
    ['under the rule', () => ruleComesOn()],
    ["while Apple's answer is pending", () => useAgeStore.getState().load(null, { willAsk: true })],
  ])('%s, signOut and signOutLocal reach the client and end the session', async (_name, arrange) => {
    arrange();
    const { client, clientAuth } = signInClient();
    setSupabaseClientForTests(client);

    await expect(auth.signOut()).resolves.toEqual({ ok: true });
    await expect(auth.signOutLocal()).resolves.toEqual({ ok: true });

    expect(clientAuth.signOut).toHaveBeenNthCalledWith(1);
    expect(clientAuth.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });

  it('under the rule, reauthenticateWithApple opens the sheet, with its nonce, and returns the code', async () => {
    ruleComesOn();
    oneNonce();
    apple.signInAsync.mockResolvedValueOnce({ authorizationCode: 'fresh-code' });

    await expect(auth.reauthenticateWithApple()).resolves.toBe('fresh-code');

    expect(apple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [], nonce: 'a'.repeat(64) });
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

  // Review 2026-11-19, item 3: not before uploads may start either.
  it("resume does nothing while Apple's answer is pending", async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);
    useAgeStore.getState().load(null, { willAsk: true });
    finishStart();

    await resumeSessionRefresh();
    expect(calls).toEqual([]);

    useAgeStore.getState().markSettled();
    await resumeSessionRefresh();
    expect(calls).toEqual(['initialize', 'start']);
  });

  it('a resume while uploads may not start leaves a pause under way to finish', async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);
    useAgeStore.getState().load(null, { willAsk: true });

    const pausing = pauseSessionRefresh();
    const resuming = resumeSessionRefresh();
    finishStart();
    await Promise.all([pausing, resuming]);

    expect(calls).toEqual(['initialize', 'stop']);
  });

  it('resume does nothing while the rule applies', async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    finishStart();

    await resumeSessionRefresh();

    expect(calls).toEqual([]);
  });

  it('resume does nothing if the rule comes on while the client is still starting', async () => {
    const { client, calls, finishStart } = refreshClient();
    setSupabaseClientForTests(client);

    const resuming = resumeSessionRefresh();
    ruleComesOn();
    finishStart();
    await resuming;

    expect(calls).toEqual(['initialize']);
  });
});

describe('a client made before uploads may start', () => {
  function makeClientWith(state: boolean | 'pending'): Record<string, unknown> {
    const rule = state === true;
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
      if (state === 'pending') age.useAgeStore.getState().load(null, { willAsk: true });
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

  // Review 2026-11-19, item 3: the client is made at launch (authStore
  // `initialize`), before Apple can answer on a launch that asks.
  it("starts with the session refresh off while Apple's answer is pending", () => {
    expect(makeClientWith('pending')).toMatchObject({ autoRefreshToken: false, persistSession: true });
  });

  it('starts with it on otherwise, as before', () => {
    expect(makeClientWith(false)).toMatchObject({ autoRefreshToken: true, persistSession: true });
  });
});

// Review 2026-11-19, item 3: a client made with the refresh off must not
// leave an adult who signed in on a launch that asked Apple with a dead
// session. Checked against the installed supabase-js and auth-js (2.106.2),
// with a fake fetch and storage: nothing here reaches a network.
//
// What the setting controls is the refresh timer (and auth-js's own
// `_recoverAndRefresh`). It does not stop the refresh of a stored session
// already within 90 s of expiry as the client starts: supabase-js's
// constructor subscribes to `onAuthStateChange` (`_listenForAuthEvents`), and
// its INITIAL_SESSION goes through `__loadSession`, which refreshes whatever
// the setting. That residual is pinned below, so a library update that
// changes it is noticed.
describe('the installed auth-js: a refresh started later', () => {
  const STORAGE_KEY = 'sb-abcdefghijklmnop-auth-token';
  const USER = {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };

  function realClient(autoRefreshToken: boolean, expiresInSeconds: number) {
    const now = Math.floor(Date.now() / 1000);
    const store = new Map<string, string>();
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + expiresInSeconds,
        user: USER,
      }),
    );
    const storage = {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: async (key: string) => {
        store.delete(key);
      },
    };
    const requests: string[] = [];
    const fetch = jest.fn(async (url: unknown) => {
      requests.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: now + 3600,
          user: USER,
        }),
      };
    });
    const client = createClient('https://abcdefghijklmnop.supabase.co', 'anon-key', {
      auth: {
        storage,
        storageKey: STORAGE_KEY,
        autoRefreshToken,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
      global: { fetch: fetch as unknown as typeof globalThis.fetch },
    });
    const refreshes = () => requests.filter((u) => u.includes('grant_type=refresh_token')).length;
    const stored = () => JSON.parse(store.get(STORAGE_KEY) ?? '{}') as { access_token?: string };
    return { client, refreshes, stored };
  }

  let made: SupabaseClient[] = [];
  afterEach(async () => {
    for (const client of made) await client.auth.stopAutoRefresh();
    made = [];
  });

  // 100 s: past the 90 s margin as the client starts, inside the timer's
  // three 30 s ticks once it runs.
  const NEAR_EXPIRY_S = 100;

  it('a session near expiry: made with the refresh off, nothing refreshes it; started later, it is refreshed at once', async () => {
    const { client, refreshes, stored } = realClient(false, NEAR_EXPIRY_S);
    made.push(client);

    await client.auth.initialize();
    await new Promise((r) => setTimeout(r, 20));
    expect(refreshes()).toBe(0);
    expect(stored().access_token).toBe('old-access');

    await client.auth.startAutoRefresh();
    await until(() => stored().access_token === 'new-access');
    expect(refreshes()).toBe(1);
  });

  it("the control: made with the refresh on, the timer's first tick refreshes the same session", async () => {
    const { client, refreshes } = realClient(true, NEAR_EXPIRY_S);
    made.push(client);

    await client.auth.initialize();

    await until(() => refreshes() > 0);
  });

  it('the residual: an already-expired stored session is refreshed as the client starts even with the refresh off', async () => {
    const { client, refreshes, stored } = realClient(false, -60);
    made.push(client);

    await client.auth.initialize();

    await until(() => stored().access_token === 'new-access');
    expect(refreshes()).toBe(1);
  });

  it('through resumeSessionRefresh, once uploads may start', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, refreshes, stored } = realClient(false, NEAR_EXPIRY_S);
    made.push(client);
    setSupabaseClientForTests(client);

    await resumeSessionRefresh();
    await new Promise((r) => setTimeout(r, 20));
    expect(refreshes()).toBe(0);

    useAgeStore.getState().markSettled();
    await resumeSessionRefresh();
    await until(() => stored().access_token === 'new-access');
    expect(refreshes()).toBe(1);
  });
});

// Sign-out with the session in the Keychain, and the two auth-js races of
// security review round 5 (client reviewer LOW-A and LOW-B), on the service
// side: a sign-out auth-js is still running after this phone ended the
// session alone is remembered until it settles (at most 60 s), and a session
// written back afterwards can be taken off the phone without the client's
// lock.

import { AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  __resetLateSignOutForTests,
  discardStoredSession,
  LATE_SIGN_OUT_WAIT_MS,
  signOut,
  signOutLocal,
  signOutStillSettling,
  whenSignOutSettles,
} from './auth';
import { setSupabaseClientForTests } from './client';
import {
  createSessionStorage,
  sessionKeys,
  type KeyValueStorage,
  type SecureStoreLike,
} from './sessionStorage';

const KEY = 'sb-project-auth-token';

class MemoryAsyncStorage implements KeyValueStorage {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

class MemoryKeychain implements SecureStoreLike {
  data = new Map<string, string>();
  async getItemAsync(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItemAsync(key: string, value: string) {
    this.data.set(key, value);
  }
  async deleteItemAsync(key: string) {
    this.data.delete(key);
  }
}

/** A client whose sign-out does what `behave` says, over `storage`. */
function clientWith(
  storage: KeyValueStorage,
  behave: () => Promise<{ error: unknown }>,
  readBack: () => Promise<{ data: { session: unknown } }> = async () => ({
    data: { session: null },
  }),
) {
  const signOutCall = jest.fn(behave);
  const getSession = jest.fn(readBack);
  setSupabaseClientForTests({
    auth: { signOut: signOutCall, getSession, storageKey: KEY, storage },
  } as unknown as Parameters<typeof setSupabaseClientForTests>[0]);
  return { signOutCall, getSession };
}

const offline = () => new AuthRetryableFetchError('Network request failed', 0);

beforeEach(() => {
  __resetLateSignOutForTests();
});

afterEach(() => {
  jest.useRealTimers();
  setSupabaseClientForTests(null);
  __resetLateSignOutForTests();
});

describe('offline sign-out with the session in the Keychain', () => {
  it('removes every piece of the session from the Keychain, and leaves AsyncStorage holding none of it', async () => {
    const asyncStorage = new MemoryAsyncStorage();
    const keychain = new MemoryKeychain();
    const storage = createSessionStorage({
      storageKey: KEY,
      asyncStorage,
      keychain: { store: keychain, accessible: 7 },
    });
    // A large session, in several pieces, as a sign-in leaves it.
    await storage.setItem(KEY, JSON.stringify({ access_token: 'a'.repeat(5000), refresh_token: 'r' }));
    await storage.setItem(`${KEY}-code-verifier`, '"v"');
    expect([...keychain.data.keys()].filter((k) => k.startsWith(KEY)).length).toBeGreaterThan(3);

    clientWith(storage, async () => ({ error: offline() }));
    await expect(signOut()).resolves.toEqual({ ok: true, localOnly: true });

    expect([...keychain.data.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
    for (const key of sessionKeys(KEY)) expect(asyncStorage.data.has(key)).toBe(false);
    // An offline answer that came at once leaves nothing running.
    expect(signOutStillSettling()).toBe(false);
  });
});

describe('a sign-out auth-js is still running (client reviewer LOW-B)', () => {
  it('is remembered when the 10 s run out, and waited for until it settles', async () => {
    jest.useFakeTimers();
    let finish: (v: { error: unknown }) => void = () => {};
    const hanging = new Promise<{ error: unknown }>((r) => (finish = r));
    clientWith(new MemoryAsyncStorage(), () => hanging);

    const outcome = signOut();
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(outcome).resolves.toEqual({ ok: true, localOnly: true });
    expect(signOutStillSettling()).toBe(true);

    let waited = false;
    const wait = (async () => {
      await whenSignOutSettles();
      waited = true;
    })();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(waited).toBe(false);

    finish({ error: null });
    await jest.advanceTimersByTimeAsync(0);
    await wait;
    expect(waited).toBe(true);
    expect(signOutStillSettling()).toBe(false);
  });

  it('holds back for at most 60 s, even if it never settles', async () => {
    jest.useFakeTimers();
    clientWith(new MemoryAsyncStorage(), () => new Promise(() => {}));

    const outcome = signOutLocal();
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(outcome).resolves.toEqual({ ok: true, localOnly: true });

    let waited = false;
    const wait = (async () => {
      await whenSignOutSettles();
      waited = true;
    })();
    await jest.advanceTimersByTimeAsync(LATE_SIGN_OUT_WAIT_MS - 1_000);
    expect(waited).toBe(false);
    expect(signOutStillSettling()).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    await wait;
    expect(waited).toBe(true);
    expect(signOutStillSettling()).toBe(false);
    expect(LATE_SIGN_OUT_WAIT_MS).toBe(60_000);
  });

  it('a later wait gets only what is left of the 60 s', async () => {
    jest.useFakeTimers();
    clientWith(new MemoryAsyncStorage(), () => new Promise(() => {}));
    const outcome = signOut();
    await jest.advanceTimersByTimeAsync(10_000);
    await outcome;
    await jest.advanceTimersByTimeAsync(50_000);

    let waited = false;
    const wait = (async () => {
      await whenSignOutSettles();
      waited = true;
    })();
    await jest.advanceTimersByTimeAsync(10_000);
    await wait;
    expect(waited).toBe(true);
  });

  it('nothing is held back after a sign-out that answered in time, either way', async () => {
    clientWith(new MemoryAsyncStorage(), async () => ({ error: null }));
    await expect(signOut()).resolves.toEqual({ ok: true });
    expect(signOutStillSettling()).toBe(false);

    clientWith(new MemoryAsyncStorage(), async () => {
      throw new Error('boom');
    });
    await expect(signOut()).resolves.toEqual({ ok: true, localOnly: true });
    expect(signOutStillSettling()).toBe(false);
    await expect(whenSignOutSettles()).resolves.toBeUndefined();
  });
});

describe('discardStoredSession (client reviewer LOW-A)', () => {
  it("removes auth-js's three keys without reading the session back (no wait on the client's lock)", async () => {
    const asyncStorage = new MemoryAsyncStorage();
    for (const key of sessionKeys(KEY)) asyncStorage.data.set(key, '{}');
    asyncStorage.data.set('calibrate:settings', '{}');
    const { getSession, signOutCall } = clientWith(asyncStorage, async () => ({ error: null }));

    await discardStoredSession();
    for (const key of sessionKeys(KEY)) expect(asyncStorage.data.has(key)).toBe(false);
    expect(asyncStorage.data.get('calibrate:settings')).toBe('{}');
    expect(getSession).not.toHaveBeenCalled();
    expect(signOutCall).not.toHaveBeenCalled();
  });

  it('never throws: no client, no storage, or a storage that refuses', async () => {
    setSupabaseClientForTests(null);
    await expect(discardStoredSession()).resolves.toBeUndefined();

    setSupabaseClientForTests({ auth: {} } as unknown as Parameters<typeof setSupabaseClientForTests>[0]);
    await expect(discardStoredSession()).resolves.toBeUndefined();

    const refusing: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {
        throw new Error('storage');
      },
    };
    clientWith(refusing, async () => ({ error: null }));
    await expect(discardStoredSession()).resolves.toBeUndefined();
  });
});

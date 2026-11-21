// What a launch reads when the client can't answer in time (the offline
// launch, 2026-11-20): the stored session's user, straight from the storage
// the client keeps it in, and whether the client's answer was auth-js's
// retryable fetch error. Neither sends anything.

import {
  AuthApiError,
  AuthInvalidTokenResponseError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  AuthWeakPasswordError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { hasAppleIdentity, isRetryableAuthError, readStoredSessionUser } from './auth';
import { createSessionStorage, type KeyValueStorage, type SecureStoreLike } from './sessionStorage';

const KEY = 'sb-project-auth-token';

function record(user: unknown, tokens: { access?: string; refresh?: string } = {}): string {
  return JSON.stringify({
    access_token: tokens.access ?? 'access-secret',
    refresh_token: tokens.refresh ?? 'refresh-secret',
    expires_in: 3600,
    expires_at: 1_700_000_000,
    token_type: 'bearer',
    user,
  });
}

/**
 * A client whose auth exposes `storageKey` and `storage` as GoTrueClient does,
 * and records every property read off it; anything else it is asked for throws.
 */
function clientWith(auth: Record<string, unknown>) {
  const touched: string[] = [];
  const watched = new Proxy(auth, {
    get(target, prop) {
      touched.push(String(prop));
      if (!(prop in target)) throw new Error(`not for a stored read: auth.${String(prop)}`);
      return target[prop as string];
    },
  });
  return { client: { auth: watched } as unknown as SupabaseClient, touched };
}

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

describe('readStoredSessionUser', () => {
  it("reads the stored session's user from the client's own storage and key, and nothing else", async () => {
    const storage = new MemoryAsyncStorage();
    storage.data.set(
      KEY,
      record({ id: 'user-1', email: 'a@example.com', app_metadata: { provider: 'apple' } }),
    );
    const getItem = jest.spyOn(storage, 'getItem');
    const { client, touched } = clientWith({ storageKey: KEY, storage });

    const user = await readStoredSessionUser(client);
    expect(user).toMatchObject({ id: 'user-1', email: 'a@example.com' });
    expect(hasAppleIdentity(user)).toBe(true);
    // No session read through the client (its lock, its refresh): the record only.
    expect([...new Set(touched)].sort()).toEqual(['storage', 'storageKey']);
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(KEY);
    expect(JSON.stringify(user)).not.toMatch(/secret/);
  });

  it('reads a session the Keychain holds in pieces', async () => {
    const storage = createSessionStorage({
      storageKey: KEY,
      asyncStorage: new MemoryAsyncStorage(),
      keychain: { store: new MemoryKeychain(), accessible: 7 },
      chunkBytes: 48,
    });
    await storage.setItem(KEY, record({ id: 'user-2', email: 'b@example.com', note: 'x'.repeat(300) }));
    const { client } = clientWith({ storageKey: KEY, storage });
    await expect(readStoredSessionUser(client)).resolves.toMatchObject({ id: 'user-2', email: 'b@example.com' });
  });

  it('is null when nothing usable is stored, and never throws', async () => {
    const withRaw = (raw: unknown) =>
      clientWith({ storageKey: KEY, storage: { getItem: async () => raw } }).client;
    for (const raw of [null, undefined, '', 'not json', '{}', record(null), record({ id: '' }), { user: { id: 'x' } }]) {
      await expect(readStoredSessionUser(withRaw(raw))).resolves.toBeNull();
    }
    // A record without a refresh token: auth-js couldn't use it either.
    await expect(readStoredSessionUser(withRaw(record({ id: 'user-1' }, { refresh: '' })))).resolves.toBeNull();
  });

  it('is null when the storage or its key cannot be had, or the read fails', async () => {
    const storage = new MemoryAsyncStorage();
    storage.data.set(KEY, record({ id: 'user-1' }));
    const cases: Array<Record<string, unknown>> = [
      { storage },
      { storageKey: '', storage },
      { storageKey: 7, storage },
      { storageKey: KEY },
      { storageKey: KEY, storage: null },
      { storageKey: KEY, storage: { removeItem: async () => {} } },
      {
        storageKey: KEY,
        storage: {
          getItem: async () => {
            throw new Error('keychain');
          },
        },
      },
    ];
    for (const auth of cases) {
      const { client } = clientWith(auth);
      await expect(readStoredSessionUser(client)).resolves.toBeNull();
    }
    // A client whose auth can't be read at all.
    const broken = new Proxy(
      {},
      {
        get() {
          throw new Error('no auth');
        },
      },
    ) as unknown as SupabaseClient;
    await expect(readStoredSessionUser(broken)).resolves.toBeNull();
  });
});

describe('isRetryableAuthError', () => {
  it("agrees with auth-js's own isAuthRetryableFetchError", () => {
    const values: unknown[] = [
      new AuthRetryableFetchError('Network request failed', 0),
      new AuthRetryableFetchError('Bad Gateway', 502),
      new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
      new AuthApiError('User not found', 403, 'user_not_found'),
      new AuthSessionMissingError(),
      new AuthUnknownError('Unexpected token <', new SyntaxError('json')),
      new AuthInvalidTokenResponseError(),
      new AuthWeakPasswordError('weak', 422, ['length']),
      new Error('Network request failed'),
      Object.assign(new Error('x'), { name: 'AuthRetryableFetchError' }),
      { name: 'AuthRetryableFetchError' },
      { __isAuthError: true, name: 'AuthRetryableFetchError' },
      null,
      undefined,
      'AuthRetryableFetchError',
      0,
    ];
    for (const value of values) {
      expect({ value, ours: isRetryableAuthError(value) }).toEqual({
        value,
        ours: isAuthRetryableFetchError(value),
      });
    }
    // And it says yes to the network failure, no to a refused token.
    expect(isRetryableAuthError(values[0])).toBe(true);
    expect(isRetryableAuthError(values[2])).toBe(false);
  });
});

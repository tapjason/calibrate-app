// The session's storage on the phone (security review round 5, 2026-11-19):
// the Keychain on iOS, in chunks, with the launch check that clears what a
// deleted install left and moves an earlier build's AsyncStorage session in.
// Both stores are in-memory fakes; no native module loads.

import {
  createSessionStorage,
  KEYCHAIN_MARKER_KEY,
  sessionKeys,
  splitUtf8,
  type KeyValueStorage,
  type SecureStoreLike,
} from './sessionStorage';

const KEY = 'sb-project-auth-token';
const ACCESSIBLE = 7; // stands in for AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY

/** A large session: about 6 KB of JSON, with characters of every UTF-8 length. */
function bigSession(): string {
  return JSON.stringify({
    access_token: 'a'.repeat(1200),
    refresh_token: 'r1',
    expires_at: 2_000_000_000,
    user: { id: 'user-1', email: 'zoë@example.com', note: 'Ünïcødé ✓ 漢字 🎉🧪'.repeat(150) },
  });
}

class FakeAsyncStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;
  async getItem(key: string) {
    if (this.failGet) throw new Error('async get');
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  async setItem(key: string, value: string) {
    if (this.failSet) throw new Error('async set');
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    if (this.failRemove) throw new Error('async remove');
    this.data.delete(key);
  }
}

class FakeKeychain implements SecureStoreLike {
  data = new Map<string, string>();
  /** The accessibility each key was last written with. */
  accessibility = new Map<string, number | undefined>();
  failGet: ((key: string) => boolean) | null = null;
  failSet: ((key: string) => boolean) | null = null;
  failDelete: ((key: string) => boolean) | null = null;
  reads = 0;
  async getItemAsync(key: string) {
    this.reads += 1;
    if (this.failGet?.(key)) throw new Error('keychain get');
    // Like the native module's Jest stub and its "not found": nothing.
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  async setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }) {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key ${key}`);
    if (this.failSet?.(key)) throw new Error('keychain set');
    this.data.set(key, value);
    this.accessibility.set(key, options?.keychainAccessible);
  }
  async deleteItemAsync(key: string) {
    if (this.failDelete?.(key)) throw new Error('keychain delete');
    this.data.delete(key);
    this.accessibility.delete(key);
  }
  /** Every key holding something under the session's keys. */
  sessionEntries(): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(KEY)).sort();
  }
}

function setup(opts: { chunkBytes?: number; maxChunks?: number; keychain?: boolean } = {}) {
  const asyncStorage = new FakeAsyncStorage();
  const keychain = new FakeKeychain();
  const storage = createSessionStorage({
    storageKey: KEY,
    asyncStorage,
    keychain: opts.keychain === false ? null : { store: keychain, accessible: ACCESSIBLE },
    chunkBytes: opts.chunkBytes,
    maxChunks: opts.maxChunks,
  });
  return { asyncStorage, keychain, storage };
}

/** A storage over existing fakes, as the next launch makes it. */
function relaunch(asyncStorage: FakeAsyncStorage, keychain: FakeKeychain) {
  return createSessionStorage({
    storageKey: KEY,
    asyncStorage,
    keychain: { store: keychain, accessible: ACCESSIBLE },
  });
}

const byteLength = (s: string) => Buffer.byteLength(s, 'utf8');

describe('splitUtf8', () => {
  it('keeps every piece within the byte limit and never splits a character', () => {
    const value = 'aé漢🎉'.repeat(500);
    const pieces = splitUtf8(value, 2000);
    expect(pieces.join('')).toBe(value);
    for (const piece of pieces) {
      expect(byteLength(piece)).toBeLessThanOrEqual(2000);
      // No lone surrogate at either end.
      expect(piece).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
    expect(pieces.length).toBeGreaterThan(1);
  });

  it('gives one piece for a short or empty value', () => {
    expect(splitUtf8('abc', 2000)).toEqual(['abc']);
    expect(splitUtf8('', 2000)).toEqual(['']);
  });
});

describe('the Keychain storage', () => {
  it('round-trips a small value, written this device only', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, '{"access_token":"a"}');
    await expect(storage.getItem(KEY)).resolves.toBe('{"access_token":"a"}');
    await expect(storage.mode()).resolves.toBe('keychain');
    // Every item, header and chunks, with the accessibility it was given.
    expect(keychain.sessionEntries().length).toBeGreaterThan(0);
    for (const key of keychain.sessionEntries()) {
      expect(keychain.accessibility.get(key)).toBe(ACCESSIBLE);
    }
  });

  it('round-trips a session larger than one Keychain item, in pieces of at most 2000 bytes', async () => {
    const { storage, keychain } = setup();
    const value = bigSession();
    expect(byteLength(value)).toBeGreaterThan(4000);
    await storage.setItem(KEY, value);
    await expect(storage.getItem(KEY)).resolves.toBe(value);
    const chunks = keychain.sessionEntries().filter((k) => k !== KEY);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const k of chunks) expect(byteLength(keychain.data.get(k)!)).toBeLessThanOrEqual(2000);
  });

  it('removes the old pieces when a smaller value replaces a larger one, and everything on removal', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, bigSession());
    const before = keychain.sessionEntries();
    await storage.setItem(KEY, '{"small":true}');
    await expect(storage.getItem(KEY)).resolves.toBe('{"small":true}');
    // Only the header and the one new piece are left.
    const after = keychain.sessionEntries();
    expect(after).toHaveLength(2);
    expect(after.filter((k) => before.includes(k) && k !== KEY)).toEqual([]);

    await storage.removeItem(KEY);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('removal sweeps pieces even when the header is gone', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, bigSession());
    // A write cut short: pieces with no header.
    keychain.data.delete(KEY);
    await storage.removeItem(KEY);
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('keeps the old value whole when a write is cut short before its header', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, '{"old":1}');
    keychain.failSet = (key) => key === KEY; // the new pieces land, the header doesn't
    await expect(storage.setItem(KEY, bigSession())).rejects.toThrow();
    keychain.failSet = null;
    await expect(storage.getItem(KEY)).resolves.toBe('{"old":1}');
  });

  it('reads a value with a piece missing as no value, never part of one', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, bigSession());
    const piece = keychain.sessionEntries().find((k) => k !== KEY)!;
    keychain.data.delete(piece);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it('reads a failing Keychain as no session, and never throws', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, '{"access_token":"a"}');
    keychain.failGet = () => true;
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    keychain.failGet = (key) => key !== KEY; // the header reads, a piece doesn't
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it('reads a header it does not know as no value', async () => {
    const { storage, keychain } = setup();
    await storage.mode();
    for (const header of ['plain text', 'fs1:c:1', 'fs1:a:0', 'fs1:a:99', '{"access_token":"a"}']) {
      keychain.data.set(KEY, header);
      await expect(storage.getItem(KEY)).resolves.toBeNull();
    }
  });

  it('refuses a value too large for its pieces, rather than storing part of it', async () => {
    const { storage, keychain } = setup({ chunkBytes: 100, maxChunks: 3 });
    await expect(storage.setItem(KEY, 'x'.repeat(301))).rejects.toThrow(/too large/);
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('a removal the Keychain refuses is reported', async () => {
    const { storage, keychain } = setup();
    await storage.setItem(KEY, '{"a":1}');
    keychain.failDelete = () => true;
    await expect(storage.removeItem(KEY)).rejects.toThrow();
  });

  it('runs one operation per key at a time, so a write and a removal never interleave', async () => {
    const { storage, keychain } = setup();
    await storage.mode();
    const writing = storage.setItem(KEY, bigSession());
    const removing = storage.removeItem(KEY);
    await Promise.all([writing, removing]);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('keeps the other session keys apart', async () => {
    const { storage } = setup();
    await storage.setItem(KEY, '{"s":1}');
    await storage.setItem(`${KEY}-code-verifier`, '"v"');
    await storage.removeItem(`${KEY}-code-verifier`);
    await expect(storage.getItem(KEY)).resolves.toBe('{"s":1}');
    await expect(storage.getItem(`${KEY}-code-verifier`)).resolves.toBeNull();
  });
});

describe('the launch check', () => {
  it('a fresh install: an empty Keychain, and the marker written', async () => {
    const { storage, asyncStorage } = setup();
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    await expect(storage.mode()).resolves.toBe('keychain');
    expect(asyncStorage.data.get(KEYCHAIN_MARKER_KEY)).toBe('1');
  });

  it('a reinstall: what the Keychain kept from the deleted app is cleared before the client reads it', async () => {
    // The first install signs in...
    const first = setup();
    await first.storage.setItem(KEY, bigSession());
    await first.storage.setItem(`${KEY}-code-verifier`, '"v"');
    expect(first.keychain.sessionEntries().length).toBeGreaterThan(0);
    // ...the app is deleted (AsyncStorage goes with it, the Keychain stays)...
    const freshAsync = new FakeAsyncStorage();
    const storage = relaunch(freshAsync, first.keychain);
    // ...and the reinstalled app finds no session.
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    await expect(storage.getItem(`${KEY}-code-verifier`)).resolves.toBeNull();
    expect(first.keychain.sessionEntries()).toEqual([]);
    expect(freshAsync.data.get(KEYCHAIN_MARKER_KEY)).toBe('1');
  });

  it('the usual launch: the marker set, the Keychain session read, nothing cleared', async () => {
    const first = setup();
    await first.storage.setItem(KEY, bigSession());
    const storage = relaunch(first.asyncStorage, first.keychain);
    await expect(storage.getItem(KEY)).resolves.toBe(bigSession());
  });

  it('an upgrade: the AsyncStorage session moves into the Keychain and leaves AsyncStorage, nobody signed out', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    // An earlier build's session, and something it left in the Keychain? No:
    // only AsyncStorage, and no marker.
    asyncStorage.data.set(KEY, bigSession());
    asyncStorage.data.set(`${KEY}-code-verifier`, '"v"');
    asyncStorage.data.set('calibrate:settings', '{}');
    const storage = relaunch(asyncStorage, keychain);

    await expect(storage.getItem(KEY)).resolves.toBe(bigSession());
    await expect(storage.mode()).resolves.toBe('keychain');
    expect(asyncStorage.data.has(KEY)).toBe(false);
    expect(asyncStorage.data.has(`${KEY}-code-verifier`)).toBe(false);
    expect(asyncStorage.data.get(KEYCHAIN_MARKER_KEY)).toBe('1');
    // Nothing else of AsyncStorage's is touched.
    expect(asyncStorage.data.get('calibrate:settings')).toBe('{}');
    // The next launch reads it from the Keychain.
    await expect(relaunch(asyncStorage, keychain).getItem(KEY)).resolves.toBe(bigSession());
  });

  it('an upgrade is never taken for a reinstall: a stale Keychain copy is replaced by the AsyncStorage session', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    const stale = relaunch(new FakeAsyncStorage(), keychain);
    await stale.setItem(KEY, '{"stale":true}');
    asyncStorage.data.set(KEY, '{"current":true}');
    await expect(relaunch(asyncStorage, keychain).getItem(KEY)).resolves.toBe('{"current":true}');
  });

  it('an older build ran in between and signed in: its newer AsyncStorage session wins', async () => {
    const first = setup();
    await first.storage.setItem(KEY, '{"before":true}');
    first.asyncStorage.data.set(KEY, '{"older-build":true}');
    const storage = relaunch(first.asyncStorage, first.keychain);
    await expect(storage.getItem(KEY)).resolves.toBe('{"older-build":true}');
    expect(first.asyncStorage.data.has(KEY)).toBe(false);
  });

  it('a marker that cannot be read: AsyncStorage this run, the Keychain untouched', async () => {
    const first = setup();
    await first.storage.setItem(KEY, '{"kept":true}');
    first.asyncStorage.failGet = true;
    const storage = relaunch(first.asyncStorage, first.keychain);
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    expect(first.keychain.sessionEntries().length).toBeGreaterThan(0);
    // The next launch, with AsyncStorage readable again, finds it.
    first.asyncStorage.failGet = false;
    await expect(relaunch(first.asyncStorage, first.keychain).getItem(KEY)).resolves.toBe(
      '{"kept":true}',
    );
  });

  it('a move into the Keychain that fails leaves the session in AsyncStorage, and nobody signed out', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    asyncStorage.data.set(KEY, '{"current":true}');
    keychain.failSet = () => true;
    const storage = relaunch(asyncStorage, keychain);
    await expect(storage.getItem(KEY)).resolves.toBe('{"current":true}');
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    expect(asyncStorage.data.get(KEY)).toBe('{"current":true}');
    expect(asyncStorage.data.has(KEYCHAIN_MARKER_KEY)).toBe(false);
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('a marker that cannot be written leaves this run on AsyncStorage, the move undone', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    asyncStorage.data.set(KEY, '{"current":true}');
    asyncStorage.failSet = true;
    const storage = relaunch(asyncStorage, keychain);
    await expect(storage.getItem(KEY)).resolves.toBe('{"current":true}');
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    expect(keychain.sessionEntries()).toEqual([]);
  });

  it('a Keychain that cannot be cleared on a reinstall keeps this run on AsyncStorage', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    keychain.data.set(KEY, 'fs1:a:1');
    keychain.data.set(`${KEY}.a0`, '{"left-behind":true}');
    keychain.failDelete = () => true;
    const storage = relaunch(asyncStorage, keychain);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    expect(asyncStorage.data.has(KEYCHAIN_MARKER_KEY)).toBe(false);
  });

  it('runs once, before the first operation, however many start together', async () => {
    const { storage, asyncStorage } = setup();
    const spy = jest.spyOn(asyncStorage, 'getItem');
    await Promise.all([storage.getItem(KEY), storage.getItem(`${KEY}-user`), storage.mode()]);
    // The marker and the three keys, read once each.
    expect(spy.mock.calls.filter(([k]) => k === KEYCHAIN_MARKER_KEY)).toHaveLength(1);
  });
});

describe('sign-out through the storage', () => {
  it("removing auth-js's three keys leaves nothing of the session in the Keychain or AsyncStorage", async () => {
    const { storage, keychain, asyncStorage } = setup();
    await storage.setItem(KEY, bigSession());
    await storage.setItem(`${KEY}-code-verifier`, '"v"');
    await storage.setItem(`${KEY}-user`, JSON.stringify({ user: { id: 'u', email: 'a@b.co' } }));
    for (const key of sessionKeys(KEY)) await storage.removeItem(key);
    expect(keychain.sessionEntries()).toEqual([]);
    for (const key of sessionKeys(KEY)) expect(asyncStorage.data.has(key)).toBe(false);
  });

  it('on AsyncStorage this run, a removal also takes any Keychain copy', async () => {
    const first = setup();
    await first.storage.setItem(KEY, '{"a":1}');
    first.asyncStorage.data.set(KEY, '{"b":2}');
    first.asyncStorage.failSet = true; // the marker can't be rewritten: AsyncStorage this run
    first.asyncStorage.data.delete(KEYCHAIN_MARKER_KEY);
    const storage = relaunch(first.asyncStorage, first.keychain);
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    await storage.removeItem(KEY);
    expect(first.asyncStorage.data.has(KEY)).toBe(false);
    expect(first.keychain.sessionEntries()).toEqual([]);
  });
});

describe('web, or a build without the Keychain module', () => {
  it('keeps the session in AsyncStorage, exactly as before', async () => {
    const { storage, asyncStorage, keychain } = setup({ keychain: false });
    await storage.setItem(KEY, '{"a":1}');
    expect(asyncStorage.data.get(KEY)).toBe('{"a":1}');
    await expect(storage.getItem(KEY)).resolves.toBe('{"a":1}');
    await storage.removeItem(KEY);
    expect(asyncStorage.data.has(KEY)).toBe(false);
    await expect(storage.mode()).resolves.toBe('asyncStorage');
    expect(asyncStorage.data.has(KEYCHAIN_MARKER_KEY)).toBe(false);
    expect(keychain.reads).toBe(0);
  });

  it('falls back to AsyncStorage for a storage key SecureStore would refuse', async () => {
    const asyncStorage = new FakeAsyncStorage();
    const keychain = new FakeKeychain();
    const storage = createSessionStorage({
      storageKey: 'sb-bad key/auth',
      asyncStorage,
      keychain: { store: keychain, accessible: ACCESSIBLE },
    });
    await expect(storage.mode()).resolves.toBe('asyncStorage');
  });
});

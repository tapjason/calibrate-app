// Where the Supabase session lives on the phone (security review, round 5,
// 2026-11-19; owner decision D69 (d)). auth-js keeps the access and refresh
// tokens in whatever storage the client is made with. Until this build that
// was AsyncStorage: a plain file in the app's folder, which goes into the
// phone's backups. On iOS it is now the Keychain (`expo-secure-store`), with
// `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: readable once the phone has been
// unlocked after a restart (a reminder's action can run with the phone locked),
// and, in Apple's words for that attribute, items that "do not migrate to a
// new device. Thus, after restoring from a backup of a different device, these
// items will not be present." (Apple does not say they are left out of a
// backup itself, only that a restore onto another phone doesn't bring them.)
// Web has no Keychain and keeps AsyncStorage, as before.
//
// Three things the Keychain needs that AsyncStorage didn't:
//
//   1. Size. Some iOS releases refused values above about 2 KB (Expo's
//      SecureStore page, read 2026-11-19), and a session with its user and
//      identities can be larger. Each value is split into chunks of at most
//      `chunkBytes` UTF-8 bytes under numbered keys, with a header under the
//      key itself. A write goes to the other of two slots and moves the header
//      last, so a write cut short leaves the old value whole. A chunk missing
//      reads as no value, never as part of one.
//   2. Deleting the app. Keychain items can outlast it ("will persist across
//      app uninstallations … not guaranteed", the same page), which would sign
//      a reinstalled app back in. AsyncStorage doesn't outlast it, so a marker
//      there says the Keychain's copy belongs to this install. Without the
//      marker, whatever the Keychain holds under the session's keys is from
//      before, and goes before the client reads anything.
//   3. The move. A session already in AsyncStorage (an upgrade from an earlier
//      build: the session there and no marker) is copied into the Keychain and
//      then removed from AsyncStorage, so nobody is signed out by the update.
//      An upgrade has the AsyncStorage session; a reinstall has neither.
//      With the marker set, a session in AsyncStorage means an older build
//      ran in between and signed in (a TestFlight downgrade), or removing the
//      copy after a move failed. Then both stores may hold one, and the one
//      that expires later is kept (client re-review N3, 2026-11-19); one that
//      can't be read loses. The AsyncStorage copy no longer wins blindly: a
//      stale copy left by a failed cleanup would sign the phone back into an
//      older session, or another account.
//
// The Keychain is used only once the marker is written, so nothing is
// decided on a read that failed: if the marker or the old session can't be
// read, or the copy or the marker can't be written, this run keeps using
// AsyncStorage as earlier builds did, and the next launch decides again.
//
// `expo-secure-store` ignores what the Keychain answers to a delete
// (SecureStoreModule.swift: `SecItemDelete`'s status is dropped), so a refused
// delete looks like success (client re-review N5). Every removal reads the
// value's keys back afterwards, and one still there counts as refused.
//
// Layer rule: L5. No imports: the native modules are handed in by the client
// (src/supabase/client.ts), so this module and its tests never load them.

/** The shape auth-js reads and writes its session through (`SupportedStorage`). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** The parts of `expo-secure-store` used here. */
export interface SecureStoreLike {
  getItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<string | null | undefined>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<void>;
}

/** The Keychain and the accessibility every item is written with. */
export interface KeychainDeps {
  store: SecureStoreLike;
  /** `SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. */
  accessible: number;
}

export interface SessionStorageDeps {
  /** The client's storage key (`supabaseStorageKey`). */
  storageKey: string;
  asyncStorage: KeyValueStorage;
  /** Null keeps the session in AsyncStorage: web, or a build without the module. */
  keychain: KeychainDeps | null;
  /** The largest chunk, in UTF-8 bytes. Default 2000, under the 2 KB some iOS releases allowed. */
  chunkBytes?: number;
  /** The most chunks a value may take. Default 16 (about 32 KB, far above a session). */
  maxChunks?: number;
}

/** Which store holds the session in this run. */
export type SessionStorageMode = 'keychain' | 'asyncStorage';

export interface SessionStorage extends KeyValueStorage {
  /** The store this run uses, once the launch check has run. */
  mode(): Promise<SessionStorageMode>;
}

/**
 * In AsyncStorage, which a deleted app takes with it: the Keychain's session
 * keys hold this install's session. Written once the check at launch has
 * cleared what an earlier install left, or moved an earlier build's session in.
 */
export const KEYCHAIN_MARKER_KEY = 'calibrate:session-in-keychain';
const KEYCHAIN_MARKER_VALUE = '1';

/** The keys auth-js stores a session under (`_saveSession`, `_removeSession`), after the storage key. */
export const SESSION_KEY_SUFFIXES = ['', '-code-verifier', '-user'] as const;

const DEFAULT_CHUNK_BYTES = 2000;
const DEFAULT_MAX_CHUNKS = 16;

/** Keys SecureStore accepts: letters, digits, `.`, `-` and `_`. */
const VALID_KEY = /^[\w.-]+$/;

type Slot = 'a' | 'b';

/** `fs1:<slot>:<chunk count>`, the header under a value's own key. */
const HEADER = /^fs1:([ab]):([1-9]\d*)$/;

/** The keys a session is stored under, for this storage key. */
export function sessionKeys(storageKey: string): string[] {
  return SESSION_KEY_SUFFIXES.map((suffix) => storageKey + suffix);
}

/**
 * The storage key supabase-js gives a client made for `url`:
 * `sb-<first label of the host>-auth-token` (SupabaseClient's constructor,
 * supabase-js 2.106.2). The client is made with this key passed explicitly,
 * so the launch check and the client agree on it; the test checks it against
 * supabase-js's own. Throws on a URL that can't be read, as createClient does.
 */
export function supabaseStorageKey(url: string): string {
  const trimmed = url.trim();
  const base = new URL(trimmed.endsWith('/') ? trimmed : `${trimmed}/`);
  return `sb-${base.hostname.split('.')[0]}-auth-token`;
}

/**
 * A stored session as an object, or null when `raw` isn't one auth-js could
 * use: not JSON, not an object, or without an access token, a refresh token
 * and a positive, finite `expires_at` (auth-js's own `_isValidSession` asks
 * for the three). Never throws.
 */
function usableStoredSession(raw: string | null | undefined): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const { access_token: access, refresh_token: refresh, expires_at: expiresAt } = record;
  if (typeof access !== 'string' || access === '') return null;
  if (typeof refresh !== 'string' || refresh === '') return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return record;
}

/**
 * When a stored session expires (`expires_at`, seconds since the epoch), or
 * null when `raw` isn't one auth-js could use (`usableStoredSession`). Never
 * throws. Exported for tests.
 */
export function storedSessionExpiry(raw: string | null | undefined): number | null {
  const record = usableStoredSession(raw);
  return record ? (record.expires_at as number) : null;
}

/**
 * The user a stored session was saved with. auth-js keeps the whole session,
 * its user inside, under the storage key when the client has no separate user
 * storage (`_saveSession`), and this app's client has none
 * (src/supabase/client.ts). Only `id` is checked, and `email` is kept only
 * when it is a string; the rest is whatever auth-js saved, unchecked. Never
 * the tokens: they sit beside the user, not in it.
 */
export interface StoredSessionUser {
  id: string;
  email?: string;
  [field: string]: unknown;
}

/**
 * The user of a stored session, for a launch the client can't answer in time
 * or can't reach the server for (authStore `initialize`; the offline launch,
 * 2026-11-20). Null unless `raw` is a session auth-js could use
 * (`usableStoredSession`) whose `user` is an object with a non-empty string
 * `id`. Never throws. Exported for tests.
 */
export function storedSessionUser(raw: string | null | undefined): StoredSessionUser | null {
  const record = usableStoredSession(raw);
  const user = record?.user;
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return null;
  const { id, email, ...rest } = user as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return null;
  return typeof email === 'string' ? { ...rest, id, email } : { ...rest, id };
}

/**
 * Of two stored sessions, whether the AsyncStorage one should replace the
 * Keychain's: it can be read, and the Keychain's can't (or there is none) or
 * expires earlier. A tie keeps the Keychain's, this build's own copy.
 */
function asyncCopyWins(asyncRaw: string | null, keychainRaw: string | null): boolean {
  const asyncExpiry = storedSessionExpiry(asyncRaw);
  if (asyncExpiry === null) return false;
  const keychainExpiry = storedSessionExpiry(keychainRaw);
  if (keychainExpiry === null) return true;
  return asyncExpiry > keychainExpiry;
}

/**
 * Split `value` into pieces of at most `maxBytes` UTF-8 bytes each, never
 * inside a character (a surrogate pair stays together). Exported for tests.
 */
export function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  let i = 0;
  while (i < value.length) {
    const cp = value.codePointAt(i) ?? 0;
    const units = cp > 0xffff ? 2 : 1;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + size > maxBytes && i > start) {
      chunks.push(value.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += size;
    i += units;
  }
  chunks.push(value.slice(start));
  return chunks;
}

/**
 * The session storage for the Supabase client: the Keychain on iOS (with the
 * launch check above), AsyncStorage elsewhere.
 *
 * Reads never throw: a Keychain read that fails reads as no session, which
 * auth-js takes as signed out without removing anything. Writes throw when
 * the Keychain refuses them, so a sign-in whose session can't be kept fails
 * rather than holding tokens nowhere. Removal tries every key and throws only
 * when the Keychain refused a delete (sign-out then says so).
 *
 * Operations on one key run one at a time, so a chunked write and a removal
 * never interleave.
 */
export function createSessionStorage(deps: SessionStorageDeps): SessionStorage {
  const { asyncStorage, storageKey } = deps;
  const keychain = deps.keychain && VALID_KEY.test(storageKey) ? deps.keychain : null;

  if (!keychain) {
    return {
      getItem: (key) => asyncStorage.getItem(key),
      setItem: (key, value) => asyncStorage.setItem(key, value),
      removeItem: (key) => asyncStorage.removeItem(key),
      mode: async () => 'asyncStorage',
    };
  }

  const store = keychain.store;
  const options = { keychainAccessible: keychain.accessible };
  const chunkBytes = Math.max(4, deps.chunkBytes ?? DEFAULT_CHUNK_BYTES);
  const maxChunks = Math.max(1, deps.maxChunks ?? DEFAULT_MAX_CHUNKS);
  const keys = sessionKeys(storageKey);

  const chunkKey = (key: string, slot: Slot, index: number) => `${key}.${slot}${index}`;

  const parseHeader = (raw: unknown): { slot: Slot; count: number } | null => {
    if (typeof raw !== 'string') return null;
    const match = HEADER.exec(raw);
    if (!match) return null;
    const count = Number(match[2]);
    if (count > maxChunks) return null;
    return { slot: match[1] as Slot, count };
  };

  /** A whole value from the Keychain, or null. Throws when the Keychain does. */
  const readValue = async (key: string): Promise<string | null> => {
    const header = parseHeader(await store.getItemAsync(key, options));
    if (!header) return null;
    const parts: string[] = [];
    for (let i = 0; i < header.count; i += 1) {
      const part = await store.getItemAsync(chunkKey(key, header.slot, i), options);
      // A piece missing: no value, never part of one.
      if (typeof part !== 'string') return null;
      parts.push(part);
    }
    return parts.join('');
  };

  /** Delete chunks `count - 1` down to 0 of a slot, so what a cut-short delete leaves starts at 0. */
  const deleteChunks = async (key: string, slot: Slot, count: number): Promise<void> => {
    for (let i = count - 1; i >= 0; i -= 1) {
      await store.deleteItemAsync(chunkKey(key, slot, i), options);
    }
  };

  /**
   * Write `value` to the slot the header doesn't name, then the header, then
   * delete the old slot's chunks. Throws when the Keychain refuses a write.
   */
  const writeValue = async (key: string, value: string): Promise<void> => {
    const chunks = splitUtf8(value, chunkBytes);
    if (chunks.length > maxChunks) {
      throw new Error(`the session is too large for the Keychain (${chunks.length} pieces)`);
    }
    let current: { slot: Slot; count: number } | null = null;
    try {
      current = parseHeader(await store.getItemAsync(key, options));
    } catch {
      current = null;
    }
    const slot: Slot = current?.slot === 'a' ? 'b' : 'a';
    for (let i = 0; i < chunks.length; i += 1) {
      await store.setItemAsync(chunkKey(key, slot, i), chunks[i], options);
    }
    await store.setItemAsync(key, `fs1:${slot}:${chunks.length}`, options);
    if (current) {
      try {
        await deleteChunks(key, current.slot, current.count);
      } catch {
        // Left for the next removal, which sweeps both slots.
      }
    }
  };

  /**
   * Whether anything of a value is in the Keychain: its header, or the first
   * chunk of either slot (a value is written from chunk 0 and deleted down to
   * it). Throws when the Keychain does.
   */
  const anyOfValueHeld = async (key: string): Promise<boolean> => {
    const [header, a0, b0] = await Promise.all([
      store.getItemAsync(key, options),
      store.getItemAsync(chunkKey(key, 'a', 0), options),
      store.getItemAsync(chunkKey(key, 'b', 0), options),
    ]);
    return typeof header === 'string' || typeof a0 === 'string' || typeof b0 === 'string';
  };

  /**
   * Remove a value: every chunk of both slots, then the header, then read
   * back. A key that shows nothing (no header, no first chunk in either slot)
   * costs three reads before and three after. Throws when the Keychain
   * refuses a delete: the module reports none (`SecItemDelete`'s answer is
   * dropped), so a value still there afterwards, or a read-back that fails,
   * counts as refused (N5).
   */
  const removeValue = async (key: string): Promise<void> => {
    let present = true;
    try {
      present = await anyOfValueHeld(key);
    } catch {
      present = true;
    }
    if (present) {
      await deleteChunks(key, 'a', maxChunks);
      await deleteChunks(key, 'b', maxChunks);
    }
    await store.deleteItemAsync(key, options);
    if (await anyOfValueHeld(key)) {
      throw new Error('the Keychain kept the value it was asked to delete');
    }
  };

  /**
   * Remove every session key from the Keychain. True only when every value is
   * gone, read back (`removeValue`); false when any is still there or can't
   * be read.
   */
  const clearKeychain = async (): Promise<boolean> => {
    let ok = true;
    for (const key of keys) {
      try {
        await removeValue(key);
      } catch {
        ok = false;
      }
    }
    return ok;
  };

  /** Remove an earlier build's session from AsyncStorage. Never throws. */
  const removeOldCopies = async (): Promise<void> => {
    for (const key of keys) {
      try {
        await asyncStorage.removeItem(key);
      } catch {
        // A later launch tries again: with the marker set, a copy found there
        // is moved in once more (see decideMode).
      }
    }
  };

  /**
   * The launch check. Runs once, before the first read or write.
   *
   *   marker set, nothing in AsyncStorage → the usual launch: the Keychain.
   *   marker set, a session in AsyncStorage too (an older build ran in
   *   between and signed in, or removing the copy after a move failed) → the
   *   one that expires later stays (`asyncCopyWins`): the Keychain's, and the
   *   AsyncStorage copy is removed; or the AsyncStorage one, moved in as below.
   *   If the Keychain's can't be read this run, nothing is changed and this run
   *   uses the Keychain (no session, as any failed Keychain read is), so the
   *   AsyncStorage copy, which may be stale, is never used on a guess; the
   *   next launch decides again.
   *   no marker (a fresh install, a reinstall, the first launch of this
   *   build) → clear what the Keychain holds, copy in any AsyncStorage
   *   session, write the marker, then remove the AsyncStorage copy.
   *
   * Any read or write that fails before the marker is written leaves this
   * run on AsyncStorage, with nothing there changed. So does a Keychain clear
   * whose deletes didn't take (read back, N5): the Keychain's old values are
   * never read in that mode.
   */
  const decideMode = async (): Promise<SessionStorageMode> => {
    let marker: string | null;
    const oldCopies: Array<[string, string]> = [];
    try {
      marker = await asyncStorage.getItem(KEYCHAIN_MARKER_KEY);
      for (const key of keys) {
        const value = await asyncStorage.getItem(key);
        if (typeof value === 'string' && value !== '') oldCopies.push([key, value]);
      }
    } catch {
      return 'asyncStorage';
    }

    if (marker === KEYCHAIN_MARKER_VALUE && oldCopies.length === 0) return 'keychain';

    if (marker === KEYCHAIN_MARKER_VALUE) {
      // Both may hold a session. The Keychain's is this install's own.
      let keychainSession: string | null;
      try {
        keychainSession = await readValue(storageKey);
      } catch {
        return 'keychain';
      }
      const asyncSession = oldCopies.find(([key]) => key === storageKey)?.[1] ?? null;
      if (!asyncCopyWins(asyncSession, keychainSession)) {
        await removeOldCopies();
        return 'keychain';
      }
    }

    // What the Keychain holds under these keys is from before: an install
    // that was deleted, an attempt cut short, or a session an older build
    // has since replaced with one that expires later. A clear that didn't
    // take (read back) keeps this run on AsyncStorage, and the marker unwritten.
    if (!(await clearKeychain())) return 'asyncStorage';
    try {
      for (const [key, value] of oldCopies) await writeValue(key, value);
      if (marker !== KEYCHAIN_MARKER_VALUE) {
        await asyncStorage.setItem(KEYCHAIN_MARKER_KEY, KEYCHAIN_MARKER_VALUE);
      }
    } catch {
      await clearKeychain();
      return 'asyncStorage';
    }
    await removeOldCopies();
    return 'keychain';
  };

  let decided: Promise<SessionStorageMode> | null = null;
  const mode = (): Promise<SessionStorageMode> => {
    if (!decided) decided = decideMode().catch(() => 'asyncStorage' as const);
    return decided;
  };

  // One operation per key at a time.
  const queues = new Map<string, Promise<unknown>>();
  const serialize = <T>(key: string, op: () => Promise<T>): Promise<T> => {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = (async () => {
      try {
        await previous;
      } catch {
        // The previous operation's failure is its caller's.
      }
      return await op();
    })();
    queues.set(key, run);
    void (async () => {
      try {
        await run;
      } catch {
        // Reported to the caller.
      } finally {
        if (queues.get(key) === run) queues.delete(key);
      }
    })();
    return run;
  };

  return {
    mode,

    async getItem(key) {
      const current = await mode();
      if (current === 'asyncStorage') return await asyncStorage.getItem(key);
      return await serialize(key, async () => {
        try {
          return await readValue(key);
        } catch {
          return null;
        }
      });
    },

    async setItem(key, value) {
      const current = await mode();
      if (current === 'asyncStorage') {
        await asyncStorage.setItem(key, value);
        return;
      }
      await serialize(key, () => writeValue(key, value));
    },

    async removeItem(key) {
      const current = await mode();
      if (current === 'asyncStorage') {
        // AsyncStorage holds it this run; a Keychain copy goes too, quietly.
        await asyncStorage.removeItem(key);
        await serialize(key, async () => {
          try {
            await removeValue(key);
          } catch {
            // The Keychain may not be usable in this run at all.
          }
        });
        return;
      }
      await serialize(key, async () => {
        try {
          await asyncStorage.removeItem(key);
        } catch {
          // Nothing of it is kept there in this mode.
        }
        await removeValue(key);
      });
    },
  };
}

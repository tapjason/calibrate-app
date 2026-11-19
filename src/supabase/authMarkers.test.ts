// What outlasts a restart about accounts on this phone (security review
// round 5): wipes owed, and accounts signed out here alone.

import {
  __resetAuthMarkersForTests,
  addOwedWipe,
  AUTH_MARKERS_KEY,
  forgetSignedOutHere,
  isSignedOutHere,
  loadAuthMarkers,
  owedWipeFor,
  owedWipes,
  rememberSignedOutHere,
  settleOwedWipe,
  type MarkerStorage,
} from './authMarkers';

class MemoryStorage implements MarkerStorage {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  async getItem(key: string) {
    if (this.failGet) throw new Error('get');
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.failSet) throw new Error('set');
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

let storage: MemoryStorage;

/** A new run of the app over the same storage. */
function restart(): void {
  __resetAuthMarkersForTests(storage);
}

beforeEach(() => {
  storage = new MemoryStorage();
  __resetAuthMarkersForTests(storage);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  __resetAuthMarkersForTests(null);
});

describe('owed wipes', () => {
  it('outlast a restart, and go once settled', async () => {
    await expect(addOwedWipe('user-1', 'deletion')).resolves.toBe(true);
    await addOwedWipe('user-2', 'signOut');
    restart();
    await loadAuthMarkers();
    expect(owedWipes()).toEqual([
      { userId: 'user-1', reason: 'deletion' },
      { userId: 'user-2', reason: 'signOut' },
    ]);
    await settleOwedWipe('user-1');
    await settleOwedWipe('user-2');
    restart();
    await loadAuthMarkers();
    expect(owedWipes()).toEqual([]);
    // Nothing left: the key itself goes.
    expect(storage.data.has(AUTH_MARKERS_KEY)).toBe(false);
  });

  it("say whether the call added it, and a sign-out's reason never replaces a deletion's", async () => {
    await expect(addOwedWipe('user-1', 'deletion')).resolves.toBe(true);
    await expect(addOwedWipe('user-1', 'signOut')).resolves.toBe(false);
    expect(owedWipeFor('user-1')).toBe('deletion');
    // A deletion asked for after a sign-out's mark makes it a deletion.
    await addOwedWipe('user-2', 'signOut');
    await expect(addOwedWipe('user-2', 'deletion')).resolves.toBe(false);
    expect(owedWipeFor('user-2')).toBe('deletion');
  });

  it('a change made before the stored markers were read neither loses nor overwrites them', async () => {
    await addOwedWipe('user-1', 'deletion');
    restart();
    // No loadAuthMarkers first: the change waits for it.
    await addOwedWipe('user-2', 'signOut');
    expect(owedWipeFor('user-1')).toBe('deletion');
    restart();
    await loadAuthMarkers();
    expect(owedWipes().map((o) => o.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('count as none when they cannot be read, so nothing is wiped on a guess', async () => {
    await addOwedWipe('user-1', 'deletion');
    restart();
    storage.failGet = true;
    await loadAuthMarkers();
    expect(owedWipes()).toEqual([]);
  });

  it('still hold for this run when they cannot be saved', async () => {
    storage.failSet = true;
    await addOwedWipe('user-1', 'deletion');
    expect(owedWipeFor('user-1')).toBe('deletion');
    expect(console.warn).toHaveBeenCalled();
  });

  it('read malformed storage leniently', async () => {
    storage.data.set(
      AUTH_MARKERS_KEY,
      JSON.stringify({
        v: 1,
        owed: [{ userId: 'ok', reason: 'signOut' }, { userId: '', reason: 'signOut' }, { userId: 'x', reason: 'other' }, null, 'user'],
        signedOutHere: ['a', 7, '', null],
      }),
    );
    await loadAuthMarkers();
    expect(owedWipes()).toEqual([{ userId: 'ok', reason: 'signOut' }]);
    expect(isSignedOutHere('a')).toBe(true);

    restart();
    storage.data.set(AUTH_MARKERS_KEY, 'not json');
    await loadAuthMarkers();
    expect(owedWipes()).toEqual([]);
  });
});

describe('accounts signed out here alone', () => {
  it('are remembered across a restart until the person signs in to one again', async () => {
    await rememberSignedOutHere('user-1');
    restart();
    await loadAuthMarkers();
    expect(isSignedOutHere('user-1')).toBe(true);
    await forgetSignedOutHere('user-1');
    restart();
    await loadAuthMarkers();
    expect(isSignedOutHere('user-1')).toBe(false);
  });

  it('keep the last ten', async () => {
    for (let i = 0; i < 12; i += 1) await rememberSignedOutHere(`user-${i}`);
    expect(isSignedOutHere('user-0')).toBe(false);
    expect(isSignedOutHere('user-1')).toBe(false);
    expect(isSignedOutHere('user-2')).toBe(true);
    expect(isSignedOutHere('user-11')).toBe(true);
  });

  it('store only ids, never a token or an email', async () => {
    await rememberSignedOutHere('user-1');
    await addOwedWipe('user-1', 'signOut');
    expect(JSON.parse(storage.data.get(AUTH_MARKERS_KEY)!)).toEqual({
      v: 1,
      owed: [{ userId: 'user-1', reason: 'signOut' }],
      signedOutHere: ['user-1'],
    });
  });
});

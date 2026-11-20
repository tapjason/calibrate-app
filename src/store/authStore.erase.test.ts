// Guest Erase removes everything on the phone, whoever's it was (main
// session decision 2026-11-19), and what else is kept per account goes with
// it; the settings stay, but for the few Erase and a confirmed account
// deletion reset, and sign-out writes none. The services are mocked; the
// store and the account markers run for real.

jest.mock('@/supabase/auth', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
  signOutLocal: jest.fn(),
  reauthenticateWithApple: jest.fn(),
  signOutStillSettling: jest.fn(() => false),
  whenSignOutSettles: jest.fn(async () => {}),
  discardStoredSession: jest.fn(async () => {}),
  hasAppleIdentity: jest.requireActual('@/supabase/auth').hasAppleIdentity,
  hasGoogleIdentity: jest.requireActual('@/supabase/auth').hasGoogleIdentity,
}));
jest.mock('@/supabase/account', () => ({
  ...jest.requireActual('@/supabase/account'),
  deleteAccountOnServer: jest.fn(),
}));
jest.mock('@/supabase/sync', () => ({
  syncNow: jest.fn().mockResolvedValue({ pulled: 0, pushed: 0 }),
  clearSyncCursor: jest.fn(async () => {}),
  pushNow: jest.fn(async () => 0),
  stopSyncFor: jest.fn(async () => {}),
  resumeSyncFor: jest.fn(),
  unsyncedRows: jest.fn(async () => new Map()),
}));
jest.mock('@/db/account', () => ({
  wipeLocalUserData: jest.fn(async () => {}),
  wipeEverythingOnDevice: jest.fn(async () => []),
}));
jest.mock('@/db/predictions', () => ({
  ...jest.requireActual('@/db/predictions'),
  countUnsynced: jest.fn(async () => 0),
  countUnsyncedForAccounts: jest.fn(async () => 0),
}));
jest.mock('@/db/categories', () => ({
  ...jest.requireActual('@/db/categories'),
  countLocalOnlyCategories: jest.fn(async () => 0),
}));
jest.mock('@/notifications/scheduler', () => ({
  dismissDeliveredNotifications: jest.fn(async () => {}),
  dismissDeliveredReminderWords: jest.fn(async () => {}),
}));
jest.mock('@/export/file', () => ({ sweepExportFiles: jest.fn(async () => {}) }));
jest.mock('@/share/export', () => ({ sweepShareCaptures: jest.fn(async () => {}) }));
jest.mock('@/media/iconImage', () => ({ sweepIconImageFiles: jest.fn(async () => {}) }));

import type { Session, SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import {
  __resetAuthMarkersForTests,
  addOwedWipe,
  isSignedOutHere,
  owedWipes,
  rememberSignedOutHere,
  type MarkerStorage,
} from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { useAgeStore } from './ageStore';
import { useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { __setLogDraftPersistenceForTests, useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { __setResolveRunPersistenceForTests, useResolveRunStore } from './resolveRunStore';
import { __setPersistenceForTests, useSettingsStore, type StoredSettings } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

// The real ones, before beforeEach swaps in mocks: the tests of a write that
// fails run them over storage that fails.
const realDraftClear = useLogDraftStore.getState().clear;
const realRunForget = useResolveRunStore.getState().forget;

const mockedAuth = auth as jest.Mocked<typeof auth>;
const server = serverAccount as jest.Mocked<typeof serverAccount>;
const wipe = (localAccount as jest.Mocked<typeof localAccount>).wipeLocalUserData;
const wipeAll = (localAccount as jest.Mocked<typeof localAccount>).wipeEverythingOnDevice;
const clearCursor = () => (jest.requireMock('@/supabase/sync') as { clearSyncCursor: jest.Mock }).clearSyncCursor;

class MemoryStorage implements MarkerStorage {
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

function sessionFor(userId: string): Session {
  return {
    access_token: 't',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      email: 'a@b.co',
      aud: 'authenticated',
      created_at: '2026-11-01T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
    },
  } as unknown as Session;
}

async function launch(stored: Session | null): Promise<void> {
  setSupabaseClientForTests({
    auth: {
      getSession: async () => ({ data: { session: stored } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as unknown as SupabaseClient);
  await useAuthStore.getState().initialize();
}

/**
 * A settings record holding a choice of the person's that nothing here resets
 * (Notifications off) and the three Erase and a confirmed deletion reset: the
 * card's left-off categories, the streak moment's day and when the line about
 * usage counts was shown.
 */
const RECORD: Partial<StoredSettings> = {
  notificationsEnabled: false,
  cardHiddenCategories: ['work'],
  streakMomentDay: 'Thu Nov 19 2026',
  usageNoticeShownAt: '2026-11-01T09:00:00.000Z',
};
/** The three after Erase or a confirmed deletion. */
const RESET = { cardHiddenCategories: [], streakMomentDay: null, usageNoticeShownAt: null };

let markerStorage: MemoryStorage;
let saves: StoredSettings[];

/** Settings read from RECORD, and every write after. */
async function settingsRead(): Promise<void> {
  saves = [];
  __setPersistenceForTests({
    load: async () => ({ ...RECORD }),
    save: async (s) => {
      saves.push(s);
    },
  });
  await useSettingsStore.getState().hydrate();
  expect(useSettingsStore.getState()).toMatchObject(RECORD);
  expect(saves).toHaveLength(0);
}

const guest = () =>
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
  markerStorage = new MemoryStorage();
  __resetAuthMarkersForTests(markerStorage);
  await settingsRead();
  wipe.mockResolvedValue(undefined);
  wipeAll.mockResolvedValue([]);
  mockedAuth.signOut.mockResolvedValue({ ok: true });
  mockedAuth.signOutLocal.mockResolvedValue({ ok: true });
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {}),
    loadResolved: jest.fn(async () => {}),
  });
  useStatsStore.setState({ loadForUser: jest.fn(async () => {}), recomputeForUser: jest.fn(async () => {}) });
  useLogDraftStore.setState({ clear: jest.fn(async () => true) });
  useResolveRunStore.setState({ clear: jest.fn(), forget: jest.fn(async () => true) });
  useWarmupStore.setState({ retake: jest.fn(async () => {}) });
  usePracticeStore.setState({ clear: jest.fn(async () => {}) });
});

afterEach(() => {
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  __setPersistenceForTests(null);
  __setLogDraftPersistenceForTests(null);
  __setResolveRunPersistenceForTests(null);
  jest.restoreAllMocks();
});

describe('guest Erase takes everything on the phone', () => {
  it('settles every owed wipe, keeps the signed-out list, and clears every account’s cursor', async () => {
    await addOwedWipe('owed-sign-out', 'signOut');
    await addOwedWipe('owed-deletion', 'deletion');
    await rememberSignedOutHere('signed-out');
    wipeAll.mockResolvedValue([LOCAL_GUEST_USER_ID, 'left-behind', 'signed-out']);
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });

    expect(wipeAll).toHaveBeenCalledTimes(1);
    expect(wipe).not.toHaveBeenCalled();
    // The full wipe did what each owed one would have.
    expect(owedWipes()).toEqual([]);
    expect(JSON.parse(markerStorage.data.get('calibrate:auth-markers') ?? '{}')).toMatchObject({
      owed: [],
      signedOutHere: ['signed-out'],
    });
    // A stale copy of that session still doesn't count.
    expect(isSignedOutHere('signed-out')).toBe(true);
    const cleared = clearCursor().mock.calls.map(([id]) => id).sort();
    expect(cleared).toEqual(['left-behind', 'owed-deletion', 'owed-sign-out', 'signed-out']);
    expect(cleared).not.toContain(LOCAL_GUEST_USER_ID);
  });

  it('a wipe that fails changes no marker and clears no cursor', async () => {
    await addOwedWipe('owed-sign-out', 'signOut');
    wipeAll.mockRejectedValueOnce(new Error('disk'));
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({
      ok: false,
      error: "Couldn't finish erasing your data. Try again.",
    });

    expect(owedWipes()).toEqual([{ userId: 'owed-sign-out', reason: 'signOut' }]);
    expect(clearCursor()).not.toHaveBeenCalled();
    expect(useWarmupStore.getState().retake).not.toHaveBeenCalled();
    // Nothing after the wipe ran: the settings are as they were, unwritten.
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
    expect(saves).toHaveLength(0);
  });

  it('waits while a sign-in is under way, touching nothing', async () => {
    let finish: (v: { ok: true }) => void = () => {};
    mockedAuth.signInWithEmail.mockReturnValue(new Promise((r) => (finish = r)));
    guest();
    const signingIn = useAuthStore.getState().signInWithEmail('a@b.co', 'a-long-enough-password');

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(wipeAll).not.toHaveBeenCalled();

    finish({ ok: true });
    await signingIn;
    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(wipeAll).toHaveBeenCalledTimes(1);
  });

  it('resets the card choices, the streak moment and the usage line, and keeps every other setting', async () => {
    guest();
    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState()).toMatchObject({ ...RESET, notificationsEnabled: false });
    expect(saves[saves.length - 1]).toMatchObject({ ...RESET, notificationsEnabled: false });
  });
});

// D73 (2026-11-20): with the support card's set-asides gone, sign-out writes
// no settings, and a confirmed deletion writes only the three it resets.
describe('the settings when the account’s rows leave', () => {
  it('a confirmed account deletion resets the three, and keeps every other setting', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(useSettingsStore.getState()).toMatchObject({ ...RESET, notificationsEnabled: false });
    expect(saves[saves.length - 1]).toMatchObject({ ...RESET, notificationsEnabled: false });
  });

  it('a deletion the server refused writes no settings', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: 'nope' });

    await useAuthStore.getState().deleteAccount();
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
    expect(saves).toHaveLength(0);
  });

  it('sign-out writes no settings', async () => {
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(wipe).toHaveBeenCalledWith('user-1', { deviceData: false, keepIntegrityCounts: true });
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
    expect(saves).toHaveLength(0);
  });

  it('a sign-out that stops to ask first writes none either', async () => {
    const { countUnsynced } = jest.requireMock('@/db/predictions') as { countUnsynced: jest.Mock };
    countUnsynced.mockResolvedValueOnce(2);
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toMatchObject({ ok: false, unsynced: 2 });
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
    expect(saves).toHaveLength(0);
  });

  // The auth store starts before the settings are read (app/_layout.tsx): a
  // wipe retried at launch must not store the defaults over the record. Once
  // read, a record a development build left holding the retired set-asides is
  // rewritten without them, as read.
  it('a sign-out’s wipe retried at launch writes no settings, and the read then drops only the retired set-asides', async () => {
    const save = jest.fn(async (_s: StoredSettings) => {});
    __setPersistenceForTests({
      load: async () => ({ ...RECORD, supportAsideKeys: ['p1#0123456789abcdef'] }) as Partial<StoredSettings>,
      save,
    });
    expect(useSettingsStore.getState().hydrated).toBe(false);
    await addOwedWipe('signed-out-earlier', 'signOut');

    await launch(null);

    expect(wipe).toHaveBeenCalledWith('signed-out-earlier', { deviceData: false, keepIntegrityCounts: true });
    expect(save).not.toHaveBeenCalled();
    await useSettingsStore.getState().hydrate();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject(RECORD);
    expect(save.mock.calls[0]![0]).not.toHaveProperty('supportAsideKeys');
  });

  it('an owed deletion’s wipe retried at launch writes no settings, before the read or after', async () => {
    const save = jest.fn(async (_s: StoredSettings) => {});
    __setPersistenceForTests({ load: async () => ({ ...RECORD }), save });
    await addOwedWipe('deleted-earlier', 'deletion');

    await launch(null);
    expect(save).not.toHaveBeenCalled();
    await useSettingsStore.getState().hydrate();
    expect(save).not.toHaveBeenCalled();
    expect(useSettingsStore.getState()).toMatchObject(RECORD);
  });
});

// A settings record that can't be read is left in place (D73): Erase's and a
// confirmed deletion's changes are automatic ones, held in memory and applied
// over the record once it reads; sign-out has none. Until 2026-11-20 each
// replaced the record, for the support card's set-asides it might hold.
describe('a settings record that cannot be read', () => {
  /** RECORD, unreadable until heal(). */
  function unreadableRecord() {
    let stored: Partial<StoredSettings> | null = { ...RECORD };
    let readable = false;
    const written: StoredSettings[] = [];
    __setPersistenceForTests({
      load: async () => {
        if (!readable) throw new Error('read failed');
        return stored;
      },
      save: async (next) => {
        written.push(next);
        stored = next;
      },
    });
    return {
      stored: () => stored,
      written,
      heal: () => {
        readable = true;
      },
    };
  }

  it('guest Erase finishes, writes nothing over it, and its changes land once it reads', async () => {
    const rec = unreadableRecord();
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().loadFailed).toBe(true);
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(rec.written).toHaveLength(0);
    expect(rec.stored()).toEqual(RECORD);

    rec.heal();
    await useSettingsStore.getState().retryLoad();
    expect(useSettingsStore.getState().loadFailed).toBe(false);
    expect(rec.stored()).toMatchObject({ ...RESET, notificationsEnabled: false });
  });

  it('a confirmed account deletion does the same', async () => {
    const rec = unreadableRecord();
    await useSettingsStore.getState().hydrate();
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(rec.written).toHaveLength(0);

    rec.heal();
    await useSettingsStore.getState().retryLoad();
    expect(rec.stored()).toMatchObject({ ...RESET, notificationsEnabled: false });
  });

  it('sign-out leaves it as it is', async () => {
    const rec = unreadableRecord();
    await useSettingsStore.getState().hydrate();
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(rec.written).toHaveLength(0);
    expect(rec.stored()).toEqual(RECORD);
    expect(useSettingsStore.getState().loadFailed).toBe(true);
  });
});

// Review 2026-11-19, item 4: one step that threw after the wipe skipped every
// step after it, the Log draft and the cache sweep included.
describe('guest Erase finishes its cleanup when one step throws', () => {
  const dismissAll = () =>
    (jest.requireMock('@/notifications/scheduler') as { dismissDeliveredNotifications: jest.Mock })
      .dismissDeliveredNotifications;
  const sweepExports = () => (jest.requireMock('@/export/file') as { sweepExportFiles: jest.Mock }).sweepExportFiles;

  it('a step that throws doesn’t stop the later ones, and Erase reports it', async () => {
    useWarmupStore.setState({
      retake: jest.fn(async () => {
        throw new Error('warm-up gone wrong');
      }),
    });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({
      ok: false,
      error: "Couldn't finish erasing your data. Try again.",
    });

    expect(wipeAll).toHaveBeenCalledTimes(1);
    expect(useLogDraftStore.getState().clear).toHaveBeenCalledTimes(1);
    expect(usePracticeStore.getState().clear).toHaveBeenCalledTimes(1);
    expect(useResolveRunStore.getState().forget).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState()).toMatchObject(RESET);
    expect(usePredictionStore.getState().loadResolved).toHaveBeenCalled();
    expect(dismissAll()).toHaveBeenCalledTimes(1);
    expect(sweepExports()).toHaveBeenCalledTimes(1);
  });

  it('every later step runs after a settings step throws too', async () => {
    const real = useSettingsStore.getState().setCardHiddenCategories;
    useSettingsStore.setState({
      setCardHiddenCategories: jest.fn(async () => {
        throw new Error('settings gone wrong');
      }),
    });
    guest();
    try {
      await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    } finally {
      useSettingsStore.setState({ setCardHiddenCategories: real });
    }
    expect(useSettingsStore.getState()).toMatchObject({ streakMomentDay: null, usageNoticeShownAt: null });
    expect(dismissAll()).toHaveBeenCalledTimes(1);
    expect(sweepExports()).toHaveBeenCalledTimes(1);
  });

  it('clears the Log draft before the wipe, even when the wipe then fails', async () => {
    const order: string[] = [];
    useLogDraftStore.setState({
      clear: jest.fn(async () => {
        order.push('draft');
        return true;
      }),
    });
    wipeAll.mockImplementationOnce(async () => {
      order.push('wipe');
      throw new Error('disk');
    });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(order).toEqual(['draft', 'wipe']);
  });

  // Re-review round two, 2026-11-19: `clear` can't throw (it swallows its
  // storage error), so the draft's removal failing is what's tested, through
  // the real `clear`: until then Erase said erased with the words on disk.
  it('a draft whose removal from storage fails stops nothing, and Erase reports it', async () => {
    let stored: unknown = { title: 'Half-typed words', dueIso: '2026-11-20T12:00:00.000Z', savedAt: 'x' };
    __setLogDraftPersistenceForTests({
      load: async () => stored as never,
      save: async (d) => {
        if (d === null) throw new Error('storage');
        stored = d;
      },
    });
    useLogDraftStore.setState({ clear: realDraftClear });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({
      ok: false,
      error: "Couldn't finish erasing your data. Try again.",
    });
    expect(stored).not.toBeNull();
    expect(wipeAll).toHaveBeenCalledTimes(1);
    expect(sweepExports()).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState()).toMatchObject(RESET);
  });

  it('a draft removed from storage counts as done', async () => {
    let stored: unknown = { title: 'Half-typed words', dueIso: '2026-11-20T12:00:00.000Z', savedAt: 'x' };
    __setLogDraftPersistenceForTests({
      load: async () => stored as never,
      save: async (d) => {
        stored = d;
      },
    });
    useLogDraftStore.setState({ clear: realDraftClear });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(stored).toBeNull();
  });

  it('an answer run whose removal from storage fails is reported, and the rest runs', async () => {
    __setResolveRunPersistenceForTests({
      load: async () => null,
      save: async () => {
        throw new Error('storage');
      },
    });
    useResolveRunStore.setState({ forget: realRunForget });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(useSettingsStore.getState()).toMatchObject(RESET);
    expect(dismissAll()).toHaveBeenCalledTimes(1);
    expect(sweepExports()).toHaveBeenCalledTimes(1);
  });

  it('the settings write that fails is reported (the card choices, the streak moment and the usage line with it), and the rest runs', async () => {
    let writes = 0;
    __setPersistenceForTests({
      load: async () => ({ ...RECORD }),
      save: async () => {
        writes += 1;
        throw new Error('storage');
      },
    });
    await useSettingsStore.getState().hydrate();
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(writes).toBeGreaterThan(0);
    // Gone from memory for this run all the same.
    expect(useSettingsStore.getState()).toMatchObject(RESET);
    expect(usePredictionStore.getState().loadResolved).toHaveBeenCalled();
    expect(dismissAll()).toHaveBeenCalledTimes(1);
  });

  it('a stored band the age store could not clear again is reported', async () => {
    const real = useAgeStore.getState().forgetBand;
    useAgeStore.setState({ forgetBand: jest.fn(async () => false) });
    guest();
    try {
      await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    } finally {
      useAgeStore.setState({ forgetBand: real });
    }
    expect(sweepExports()).toHaveBeenCalledTimes(1);
  });

  it('what each account left, when clearing it throws, is reported', async () => {
    wipeAll.mockResolvedValue(['left-behind']);
    clearCursor().mockRejectedValueOnce(new Error('storage'));
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    expect(useSettingsStore.getState()).toMatchObject(RESET);
    expect(sweepExports()).toHaveBeenCalledTimes(1);
  });

  it('a retry after a step failed runs it all again, and finishes', async () => {
    useWarmupStore.setState({
      retake: jest
        .fn<Promise<void>, []>()
        .mockRejectedValueOnce(new Error('once'))
        .mockResolvedValue(undefined),
    });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toMatchObject({ ok: false });
    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(wipeAll).toHaveBeenCalledTimes(2);
  });
});

// Record audit 2026-11-19, item 6: Erase removes changes accounts never
// pushed; the confirmation names how many, read at the moment it asks.
describe('countUnsyncedAccountChanges', () => {
  const count = () =>
    (jest.requireMock('@/db/predictions') as { countUnsyncedForAccounts: jest.Mock }).countUnsyncedForAccounts;

  it('reads the count afresh at each call', async () => {
    count().mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    await expect(useAuthStore.getState().countUnsyncedAccountChanges()).resolves.toBe(3);
    await expect(useAuthStore.getState().countUnsyncedAccountChanges()).resolves.toBe(5);
    expect(count()).toHaveBeenCalledTimes(2);
  });

  it('is null when the count can’t be read, and never throws', async () => {
    count().mockRejectedValueOnce(new Error('disk'));
    await expect(useAuthStore.getState().countUnsyncedAccountChanges()).resolves.toBeNull();
  });
});

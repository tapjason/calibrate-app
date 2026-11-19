// Guest Erase removes everything on the phone, whoever's it was (main
// session decision 2026-11-19), and what else is kept per account goes with
// it; and the support card's set-asides go with Erase, a confirmed account
// deletion and sign-out (2026-11-19). The services are mocked; the store and
// the account markers run for real.

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
import { supportAsideKey } from '@/engine/supportAside';
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

import { useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { __setPersistenceForTests, useSettingsStore, type StoredSettings } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

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

const KEY = supportAsideKey({ id: 'p1', title: 'I want to die before this ships', reflection: null });

let markerStorage: MemoryStorage;
let saves: StoredSettings[];

/** Settings read from a record holding one set-aside, and every write after. */
async function settingsWithOneSetAside(): Promise<void> {
  saves = [];
  __setPersistenceForTests({
    load: async () => ({ supportAsideKeys: [KEY], notificationsEnabled: false }),
    save: async (s) => {
      saves.push(s);
    },
  });
  await useSettingsStore.getState().hydrate();
  expect(useSettingsStore.getState().supportAsideKeys).toEqual([KEY]);
}

const guest = () =>
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
  markerStorage = new MemoryStorage();
  __resetAuthMarkersForTests(markerStorage);
  await settingsWithOneSetAside();
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
  useLogDraftStore.setState({ clear: jest.fn(async () => {}) });
  useResolveRunStore.setState({ clear: jest.fn() });
  useWarmupStore.setState({ retake: jest.fn(async () => {}) });
  usePracticeStore.setState({ clear: jest.fn(async () => {}) });
});

afterEach(() => {
  useAuthStore.getState().reset();
  setSupabaseClientForTests(null);
  __resetAuthMarkersForTests(null);
  __setPersistenceForTests(null);
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
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([KEY]);
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

  it('forgets the support card’s set-asides', async () => {
    guest();
    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
    expect(saves[saves.length - 1]).not.toHaveProperty('supportAsideKeys');
    // Settings themselves stay.
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
  });
});

describe('the support card’s set-asides leave with the account’s rows', () => {
  it('a confirmed account deletion forgets them', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
  });

  it('a deletion the server refused keeps them', async () => {
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: false, error: 'nope' });

    await useAuthStore.getState().deleteAccount();
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([KEY]);
  });

  it('sign-out forgets them: each key hashes the words', async () => {
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toEqual({ ok: true });
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
  });

  it('a sign-out that stops to ask first keeps them', async () => {
    const { countUnsynced } = jest.requireMock('@/db/predictions') as { countUnsynced: jest.Mock };
    countUnsynced.mockResolvedValueOnce(2);
    await launch(sessionFor('user-1'));

    await expect(useAuthStore.getState().signOut()).resolves.toMatchObject({ ok: false, unsynced: 2 });
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([KEY]);
  });

  // The auth store starts before the settings are read (app/_layout.tsx): a
  // wipe retried at launch must not store the defaults over the record.
  it('a wipe retried at launch, before the settings are read, writes no settings', async () => {
    const save = jest.fn(async () => {});
    __setPersistenceForTests({ load: async () => ({ supportAsideKeys: [KEY] }), save });
    expect(useSettingsStore.getState().hydrated).toBe(false);
    await addOwedWipe('signed-out-earlier', 'signOut');

    await launch(null);

    expect(wipe).toHaveBeenCalledWith('signed-out-earlier', { deviceData: false, keepIntegrityCounts: true });
    expect(save).not.toHaveBeenCalled();
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([KEY]);
  });
});

// Guest Erase waits for the cache sweep and reports a leftover (round two,
// 2026-11-19): the sweep wasn't awaited, so a CSV export holding every title
// and note could stay in the app's cache while Erase said it was done. Now
// `sweepCachedCopies` resolves true only when the exports, card images and
// picker pictures are all gone, and Erase runs it as an awaited step, so a
// leftover makes it say it couldn't finish and a retry sweeps again.
//
// The three sweeps run for real here, over in-memory folders put in through
// their own test seams; the other services are mocked, as in
// authStore.erase.test.ts. Sign-out and account deletion still don't wait on
// the sweep.

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

import type { SupabaseClient } from '@supabase/supabase-js';

import * as localAccount from '@/db/account';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { __setFileExportDepsForTests, type FileExportDeps } from '@/export/file';
import { __setIconImageDepsForTests } from '@/media/iconImage';
import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import * as serverAccount from '@/supabase/account';
import * as auth from '@/supabase/auth';
import { __resetAuthMarkersForTests, type MarkerStorage } from '@/supabase/authMarkers';
import { setSupabaseClientForTests } from '@/supabase/client';

import { __resetAgeStoreForTests } from './ageStore';
import { useAuthStore } from './authStore';
import { useCategoryStore } from './categoryStore';
import { useLogDraftStore } from './logDraftStore';
import { usePracticeStore } from './practiceStore';
import { usePredictionStore } from './predictionStore';
import { useResolveRunStore } from './resolveRunStore';
import { __setPersistenceForTests, useSettingsStore } from './settingsStore';
import { useStatsStore } from './statsStore';
import { useWarmupStore } from './warmupStore';

const mockedAuth = auth as jest.Mocked<typeof auth>;
const server = serverAccount as jest.Mocked<typeof serverAccount>;
const wipeAll = (localAccount as jest.Mocked<typeof localAccount>).wipeEverythingOnDevice;

const ERASE_FAILED = { ok: false, error: "Couldn't finish erasing your data. Try again." };
const CSV = 'fairly-sure-2026-11-18.csv';
const CAPTURE = '0F8FAD5B-D9CB-469F-A165-70867728950E.png';
const PICTURE = '7C9E6679-7425-40DE-944B-E07FC1F90AE7.jpeg';

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

/**
 * The three cache folders in memory, through the sweeps' own seams. Each
 * delete fails once for the names in `failOnce`.
 */
function cacheFolders(
  opts: {
    exports?: readonly string[];
    captures?: readonly string[];
    pictures?: readonly string[];
    failOnce?: readonly string[];
  } = {},
) {
  const exportsLeft = new Set(opts.exports ?? []);
  const capturesLeft = new Set(opts.captures ?? []);
  const picturesLeft = new Set(opts.pictures ?? []);
  const failing = new Set(opts.failOnce ?? []);
  const attempt = (name: string) => {
    if (failing.delete(name)) throw new Error('busy');
  };

  const fileDeps: FileExportDeps = {
    writeCacheFile: jest.fn(async () => 'file:///cache/x.csv'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => {}),
    listCacheFiles: jest.fn(async () => [...exportsLeft]),
    deleteCacheFile: jest.fn(async (name: string) => {
      attempt(name);
      exportsLeft.delete(name);
    }),
  };
  __setFileExportDepsForTests(fileDeps);

  const shareDeps: ShareDeps = {
    capture: jest.fn(async () => 'file:///tmp/x.png'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => {}),
    listCaptures: jest.fn(async () => [...capturesLeft].map((name) => ({ name, uri: `file:///c/tmp/ReactNative/${name}` }))),
    deleteCapture: jest.fn(async (uri: string) => {
      const name = uri.slice(uri.lastIndexOf('/') + 1);
      attempt(name);
      capturesLeft.delete(name);
    }),
  };
  __setShareDepsForTests(shareDeps);

  __setIconImageDepsForTests({
    pick: async () => null,
    squarePng: async () => 'AAAA',
    listCached: async () => [...picturesLeft].map((name) => ({ name, uri: `file:///c/ImagePicker/${name}` })),
    discard: async (uri: string) => {
      const name = uri.slice(uri.lastIndexOf('/') + 1);
      attempt(name);
      picturesLeft.delete(name);
    },
  });

  return { exportsLeft, capturesLeft, picturesLeft, fileDeps };
}

const guest = () =>
  useAuthStore.setState({ userId: LOCAL_GUEST_USER_ID, status: 'guest', hasAppleIdentity: false });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  useAuthStore.getState().reset();
  __resetAgeStoreForTests();
  __resetAuthMarkersForTests(new MemoryStorage());
  __setPersistenceForTests({ load: async () => ({}), save: async () => {} });
  await useSettingsStore.getState().hydrate();
  wipeAll.mockResolvedValue([]);
  mockedAuth.signOutLocal.mockResolvedValue({ ok: true });
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({ loadPending: jest.fn(async () => {}), loadResolved: jest.fn(async () => {}) });
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
  __setFileExportDepsForTests(null);
  __setShareDepsForTests(null);
  __setIconImageDepsForTests(null);
  __resetAgeStoreForTests();
  jest.restoreAllMocks();
});

describe('guest Erase waits for the cache sweep', () => {
  it('nothing to remove: Erase finishes', async () => {
    cacheFolders();
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
  });

  it('every copy there goes, and Erase finishes', async () => {
    const left = cacheFolders({ exports: [CSV, 'notes.csv'], captures: [CAPTURE], pictures: [PICTURE] });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });

    expect([...left.exportsLeft]).toEqual(['notes.csv']);
    expect(left.capturesLeft.size).toBe(0);
    expect(left.picturesLeft.size).toBe(0);
  });

  it.each([
    ['a CSV export', { exports: [CSV], failOnce: [CSV] }, 'exportsLeft'],
    ['a card image', { captures: [CAPTURE], failOnce: [CAPTURE] }, 'capturesLeft'],
    ['a picker picture', { pictures: [PICTURE], failOnce: [PICTURE] }, 'picturesLeft'],
  ] as const)(
    "%s that won't delete: Erase says it couldn't finish, and a retry removes it and finishes",
    async (_name, folders, which) => {
      const left = cacheFolders(folders);
      guest();

      await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual(ERASE_FAILED);
      expect(left[which].size).toBe(1);
      expect(useAuthStore.getState().pending).toBe(false);

      await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual({ ok: true });
      expect(left[which].size).toBe(0);
      expect(wipeAll).toHaveBeenCalledTimes(2);
    },
  );

  it("a cache that can't be listed: Erase says it couldn't finish", async () => {
    const { fileDeps } = cacheFolders({ exports: [CSV] });
    (fileDeps.listCacheFiles as jest.Mock).mockImplementation(async () => {
      throw new Error('no dir');
    });
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual(ERASE_FAILED);
  });

  it('the later steps still run after a sweep that failed', async () => {
    cacheFolders({ exports: [CSV], failOnce: [CSV] });
    const dismiss = (jest.requireMock('@/notifications/scheduler') as { dismissDeliveredNotifications: jest.Mock })
      .dismissDeliveredNotifications;
    guest();

    await expect(useAuthStore.getState().eraseDeviceData()).resolves.toEqual(ERASE_FAILED);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(usePracticeStore.getState().clear).toHaveBeenCalledTimes(1);
  });
});

describe('account deletion still does not wait on the sweep', () => {
  it('finishes while the sweep has not settled, and still sweeps', async () => {
    const { fileDeps } = cacheFolders({ exports: [CSV] });
    (fileDeps.listCacheFiles as jest.Mock).mockImplementation(() => new Promise(() => {}));
    setSupabaseClientForTests({ auth: {} } as unknown as SupabaseClient);
    useAuthStore.setState({ userId: 'user-1', email: 'a@b.co', status: 'authenticated', hasAppleIdentity: false });
    server.deleteAccountOnServer.mockResolvedValue({ ok: true, appleRevoked: false });

    await expect(useAuthStore.getState().deleteAccount()).resolves.toEqual({ ok: true, appleNotRevoked: false });
    expect(fileDeps.listCacheFiles).toHaveBeenCalled();
  });
});

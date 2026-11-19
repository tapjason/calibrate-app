import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureAgeBucket, hydrateAgeGate, recheckAgeBucketIfDue } from '@/age/ageRange';
import { initLocalOnly } from '@/age/localOnly';
import { flushEvents } from '@/analytics/flush';
import { sweepExportFiles } from '@/export/file';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { syncForUser, useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useLockStore } from '@/store/lockStore';
import { useLogDraftStore } from '@/store/logDraftStore';
import { usePracticeStore } from '@/store/practiceStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useResolveRunStore } from '@/store/resolveRunStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';

import RootLayout from '../../../app/_layout';

// The root layout (app/_layout.tsx), the app's composition root: what it
// sends and sweeps at launch and on each return to the foreground. Tested
// from here: a test file under app/ could be read as a route.
//
// D69 (b): a guest's usage counts go up only once the line on the Warm-up's
// first screen, which says so and holds the switch, has been shown on this
// phone (the settings store keeps when); before, they stay queued. Round 5:
// export files left in the cache are swept at launch. D70: the stored age
// band is read before the auth store initialises, and nothing is flushed at
// launch on a local-only phone or before Apple has answered.

jest.mock('@react-navigation/native', () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: React.ReactNode }) => children ?? null;
  Stack.Screen = () => null;
  return {
    Stack,
    usePathname: () => '/',
    useRootNavigationState: () => ({ key: 'root' }),
    useRouter: () => mockRouter,
  };
});
jest.mock('@/components/launch/AppLockGate', () => ({ AppLockGate: () => null }));
jest.mock('@/components/launch/LaunchPage', () => ({ LaunchPage: () => null }));
jest.mock('@/components/launch/LaunchScreen', () => ({ LaunchScreen: () => null }));
jest.mock('@/components/launch/useLaunchSplash', () => ({
  holdSplash: jest.fn(),
  useLaunchSplash: jest.fn(),
}));
jest.mock('@/components/ui/useAppearance', () => ({ useAppearance: () => 'light' }));
jest.mock('@/constants/fonts', () => ({ loadFonts: jest.fn(async () => {}) }));
jest.mock('@/db/client', () => ({
  ...jest.requireActual('@/db/client'),
  initDb: jest.fn(async () => {}),
}));
jest.mock('@/age/ageRange', () => ({
  ensureAgeBucket: jest.fn(async () => null),
  hydrateAgeGate: jest.fn(async () => {}),
  recheckAgeBucketIfDue: jest.fn(async () => false),
}));
jest.mock('@/age/localOnly', () => ({ initLocalOnly: jest.fn() }));
jest.mock('@/analytics/flush', () => ({ flushEvents: jest.fn(async () => 0) }));
jest.mock('@/billing/init', () => ({
  initBilling: jest.fn(async () => {}),
  refreshBilling: jest.fn(async () => {}),
}));
jest.mock('@/export/file', () => ({ sweepExportFiles: jest.fn(async () => {}) }));
jest.mock('@/notifications/digest', () => ({
  ...jest.requireActual('@/notifications/digest'),
  initDigest: jest.fn(async () => {}),
}));
jest.mock('@/notifications/practiceReminder', () => ({
  ...jest.requireActual('@/notifications/practiceReminder'),
  initPracticeReminder: jest.fn(),
}));
jest.mock('@/notifications/trialReminder', () => ({
  ...jest.requireActual('@/notifications/trialReminder'),
  initTrialReminder: jest.fn(),
}));
jest.mock('@/notifications/scheduler', () => ({
  ...jest.requireActual('@/notifications/scheduler'),
  initNotifications: jest.fn(async () => {}),
  routeFromLaunchNotification: jest.fn(async () => {}),
}));
jest.mock('@/store/authStore', () => ({
  ...jest.requireActual('@/store/authStore'),
  syncForUser: jest.fn(async () => {}),
}));

const GUEST = 'local-user-v1';
const flush = flushEvents as jest.Mock;
const sweep = sweepExportFiles as jest.Mock;
const sync = syncForUser as jest.Mock;
const hydrateAge = hydrateAgeGate as jest.Mock;
const ensureAge = ensureAgeBucket as jest.Mock;
const recheckAge = recheckAgeBucketIfDue as jest.Mock;
const initRule = initLocalOnly as jest.Mock;

let appStateHandlers: Array<(next: AppStateStatus) => void>;

const noWarmup = { completedAt: null, index: 0, pick: null, answers: [], result: null };
const finishedWarmup = { ...noWarmup, completedAt: '2026-11-10T09:00:00.000Z', index: 10 };
const SHOWN = '2026-11-19T09:00:00.000Z';

/**
 * The stores as launch leaves them, with their loads stubbed: who is signed
 * in, when the line about usage counts was first shown as the settings'
 * hydrate reads it, and the Warm-up's record as its hydrate reads it.
 */
function seed({
  status = 'guest',
  userId = GUEST,
  shownAt = null,
  warmup = noWarmup,
}: {
  status?: 'guest' | 'authenticated';
  userId?: string;
  shownAt?: string | null;
  warmup?: Partial<ReturnType<typeof useWarmupStore.getState>>;
} = {}) {
  useAuthStore.setState({ initialize: jest.fn(async () => {}), status, userId });
  useCategoryStore.setState({ load: jest.fn(async () => {}) });
  usePredictionStore.setState({
    loadPending: jest.fn(async () => {}),
    loadResolved: jest.fn(async () => {}),
    pending: [],
    resolved: [],
  });
  useStatsStore.setState({ loadForUser: jest.fn(async () => {}) });
  // The stamp is read by hydrate, as at a real launch: nothing before it.
  useSettingsStore.setState({
    analyticsEnabled: true,
    usageNoticeShownAt: null,
    hydrate: jest.fn(async () => {
      useSettingsStore.setState({ usageNoticeShownAt: shownAt, hydrated: true });
    }),
  });
  useLockStore.setState({ arm: jest.fn(), locked: false });
  // The record is read by hydrate, as at a real launch.
  useWarmupStore.setState({
    ...noWarmup,
    hydrate: jest.fn(async () => {
      useWarmupStore.setState({ ...warmup, hydrated: true });
    }),
  });
  usePracticeStore.setState({ hydrate: jest.fn(async () => {}) });
  useLogDraftStore.setState({ hydrate: jest.fn(async () => {}) });
  useResolveRunStore.setState({ hydrate: jest.fn(async () => {}) });
}

async function launch() {
  render(<RootLayout />);
  // The launch sweep runs beside the launch flush, at the end of the gate.
  await waitFor(() => expect(sweep).toHaveBeenCalledTimes(1));
}

/** The app comes back to the front. */
function foreground() {
  act(() => {
    for (const handler of appStateHandlers) handler('active');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') appStateHandlers.push(handler as (next: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => __resetAgeStoreForTests());
});

describe('the root layout: usage counts (D69 (b))', () => {
  it('sends nothing for a guest who has never been shown the line, at launch or on return', async () => {
    seed();
    await launch();
    expect(flush).not.toHaveBeenCalled();

    foreground();
    // The foreground's other work still runs; only the counts wait.
    expect(sync).toHaveBeenCalledWith(GUEST);
    expect(flush).not.toHaveBeenCalled();
  });

  // Someone who finished the Warm-up on a build from before the line never saw
  // it. A finished Warm-up no longer stands in for it, nor does one part-way.
  it.each([
    ['finished the Warm-up', finishedWarmup],
    ['answered a Warm-up question', { index: 3 }],
  ])('sends nothing for a guest who %s with no stamp', async (_label, warmup) => {
    seed({ warmup });
    await launch();
    expect(flush).not.toHaveBeenCalled();

    foreground();
    expect(flush).not.toHaveBeenCalled();
  });

  it('sends a guest’s counts once the line has been shown, read after the settings’ hydrate', async () => {
    seed({ shownAt: SHOWN, warmup: finishedWarmup });
    await launch();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(GUEST);

    foreground();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith(GUEST);
  });

  it('sends on return once the line is shown during this launch, and stops once Erase forgets it', async () => {
    seed();
    await launch();
    expect(flush).not.toHaveBeenCalled();

    // The Warm-up's first screen is drawn: it stamps the store.
    act(() => useSettingsStore.setState({ usageNoticeShownAt: SHOWN }));
    foreground();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(GUEST);

    // Erase clears it with the Warm-up.
    act(() => useSettingsStore.setState({ usageNoticeShownAt: null }));
    foreground();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-in account’s counts with no stamp: the sign-in screen said what goes up', async () => {
    seed({ status: 'authenticated', userId: 'user-1' });
    await launch();
    expect(flush).toHaveBeenCalledWith('user-1');

    foreground();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith('user-1');
  });
});

describe('the root layout: export files (round 5)', () => {
  it.each([
    ['a guest whose counts wait', {}],
    ['a signed-in account', { status: 'authenticated' as const, userId: 'user-1' }],
  ])('sweeps leftover exports once at launch, for %s', async (_label, who) => {
    seed(who);
    await launch();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledWith();

    // Not on return: a share sheet may be open then, and the export's own
    // sweep leaves its file for the app it's going to.
    foreground();
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

// D70 (docs/design/research/under-13-2026-11.md, "Screens"): the stored band
// goes into the age store after the database opens and before the auth store
// initialises, which makes the Supabase client and starts the first sync.
describe('the root layout: the under-13 rule (D70)', () => {
  it('reads the stored age band, then follows the rule, before the auth store initialises', async () => {
    seed();
    const order: string[] = [];
    hydrateAge.mockImplementationOnce(async () => {
      order.push('hydrateAgeGate');
    });
    initRule.mockImplementationOnce(() => {
      order.push('initLocalOnly');
    });
    useAuthStore.setState({
      initialize: jest.fn(async () => {
        order.push('initialize');
      }),
    });
    await launch();
    expect(order).toEqual(['hydrateAgeGate', 'initLocalOnly', 'initialize']);
    expect(hydrateAge).toHaveBeenCalledTimes(1);
    expect(initRule).toHaveBeenCalledTimes(1);
  });

  it('asks Apple once the first screen is up, and checks whether a re-ask is due', async () => {
    seed();
    await launch();
    await waitFor(() => expect(ensureAge).toHaveBeenCalledTimes(1));
    expect(recheckAge).toHaveBeenCalledTimes(1);
  });

  it('checks for a re-ask on each return to the front, for a guest too, but not under the app lock', async () => {
    seed();
    await launch();
    recheckAge.mockClear();

    foreground();
    expect(recheckAge).toHaveBeenCalledTimes(1);

    act(() => useLockStore.setState({ locked: true }));
    recheckAge.mockClear();
    foreground();
    expect(recheckAge).not.toHaveBeenCalled();
  });

  it('flushes nothing at launch or on return on a local-only phone', async () => {
    seed({ status: 'authenticated', userId: 'user-1', shownAt: SHOWN });
    useAgeStore.setState({ localOnly: true, settled: true });
    await launch();
    expect(flush).not.toHaveBeenCalled();

    foreground();
    expect(flush).not.toHaveBeenCalled();
  });

  it('flushes nothing at launch while Apple has yet to answer', async () => {
    seed({ shownAt: SHOWN, warmup: finishedWarmup });
    useAgeStore.setState({ localOnly: false, settled: false });
    await launch();
    expect(flush).not.toHaveBeenCalled();
  });
});

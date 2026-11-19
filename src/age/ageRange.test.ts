import { Platform } from 'react-native';

import { getAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import { getDb, setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore, whenAgeSettled } from '@/store/ageStore';

import {
  __setAgeRangeDepsForTests,
  AGE_RECHECK_MIN_MS,
  ensureAgeBucket,
  hydrateAgeGate,
  recheckAgeBucketIfDue,
  type AgeRangeDeps,
} from './ageRange';

jest.mock('expo-age-range', () => ({
  requestAgeRangeAsync: jest.fn(),
}));

import * as AgeRange from 'expo-age-range';

const nativeRequest = AgeRange.requestAgeRangeAsync as jest.Mock;
const originalOS = Platform.OS;
const originalVersion = Platform.Version;

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const TEEN = { lowerBound: 13, upperBound: 15 };
const ADULT = { lowerBound: 18, upperBound: null };

function usePlatform(os: string, version: string | number = originalVersion): void {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}

function deps(partial: Partial<AgeRangeDeps> & Pick<AgeRangeDeps, 'request'>): AgeRangeDeps {
  return {
    isAvailable: () => true,
    ...partial,
  };
}

const declined = () =>
  jest.fn(async () => {
    throw Object.assign(new Error('declined'), { code: 'ERR_AGE_RANGE_USER_DECLINED' });
  });

/** Waits (a few turns of the event loop at most) until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i += 1) await new Promise((r) => setImmediate(r));
  if (!done()) throw new Error('the condition never held');
}

/** A launch: the stored band read into the age store, as the root layout does first. */
async function launch(): Promise<void> {
  await hydrateAgeGate();
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __setAgeRangeDepsForTests(null);
  __resetAgeStoreForTests();
  nativeRequest.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  usePlatform(originalOS, originalVersion);
  __setAgeRangeDepsForTests(null);
  __resetAgeStoreForTests();
  setDbForTests(null);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ensureAgeBucket', () => {
  it('does not ask or store anything when the API is unavailable', async () => {
    // The SDK answers web and older iOS with a fake adult. That must not
    // become a stored band just because a call would have returned one.
    const request = jest.fn(async () => ({
      lowerBound: 18,
      upperBound: null,
      installId: 'should-not-be-read',
      activeParentalControls: ['communicationLimits'],
    }));
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, request }));

    await expect(ensureAgeBucket()).resolves.toBeNull();

    expect(request).not.toHaveBeenCalled();
    expect(await getAgeBucket()).toBeNull();
  });

  it('stays open when the request throws', async () => {
    const request = jest.fn(async () => {
      throw new Error('age range exploded');
    });
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(await getAgeBucket()).toBeNull();
    expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });
  });

  it('stays open when the person declines', async () => {
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(await getAgeBucket()).toBeNull();
  });

  it('persists only the age band from a response that carries more', async () => {
    __setAgeRangeDepsForTests(
      deps({
        request: async () => ({
          lowerBound: 16,
          upperBound: 18,
          ageRangeDeclaration: 'guardianDeclared',
          activeParentalControls: ['communicationLimits'],
          installId: 'play-install',
          userStatus: 'SUPERVISED',
          mostRecentApprovalDate: 1_700_000_000_000,
        }),
      }),
    );

    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: 16, upperBound: 18 });

    const row = await getDb().get<Record<string, unknown>>(`SELECT * FROM age_bucket`);
    expect(row).toEqual({ id: 'me', lower_bound: 16, upper_bound: 18 });
    expect(Object.keys(row ?? {}).sort()).toEqual(['id', 'lower_bound', 'upper_bound']);
  });

  it('stores an open side as null', async () => {
    __setAgeRangeDepsForTests(deps({ request: async () => ({ lowerBound: 18, upperBound: null }) }));

    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: 18, upperBound: null });
    expect(await getAgeBucket()).toEqual({ lowerBound: 18, upperBound: null });
  });

  it('does not store a response that is not a band', async () => {
    __setAgeRangeDepsForTests(
      deps({
        request: async () => ({
          lowerBound: null,
          upperBound: null,
          ageRangeDeclaration: 'selfDeclared',
        }),
      }),
    );

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(await getAgeBucket()).toBeNull();
  });

  it('asks once per launch, including after a decline', async () => {
    const request = declined();
    __setAgeRangeDepsForTests(deps({ request }));

    await ensureAgeBucket();
    await ensureAgeBucket();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask again once a band that is not under 13 is stored', async () => {
    await saveAgeBucket({ lowerBound: 13, upperBound: 16 });
    const request = jest.fn(async () => ({ lowerBound: 18, upperBound: null }));
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: 13, upperBound: 16 });
    await ensureAgeBucket();

    expect(request).not.toHaveBeenCalled();
  });

  // The band gates uploads now (D70): a launch whose stored band can't be
  // read asks Apple, whose cached answer brings the band back for this run.
  // An under-13 answer applies even though it can't be saved.
  it('asks when the database is not open, and an under-13 answer still applies for the run', async () => {
    setDbForTests(null);
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toEqual(UNDER_13);

    expect(request).toHaveBeenCalledTimes(1);
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('a band that is not under 13 and cannot be saved lifts nothing', async () => {
    setDbForTests(null);
    useAgeStore.getState().load(UNDER_13, { willAsk: true });
    __setAgeRangeDepsForTests(deps({ request: async () => ADULT }));

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });
});

describe('the under-13 rule (D70)', () => {
  it('a stored under-13 band turns the rule on at launch, before anything is asked', async () => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => UNDER_13) }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: false });
  });

  it('a stored band that is not under 13 is settled at once and never asked about', async () => {
    await saveAgeBucket(ADULT);
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));

    await launch();
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });

    await ensureAgeBucket();
    expect(request).not.toHaveBeenCalled();
    expect(useAgeStore.getState().localOnly).toBe(false);
  });

  it('no stored band on a phone that can ask: unsettled until the answer', async () => {
    let answer: (v: unknown) => void = () => {};
    const request = jest.fn(() => new Promise((resolve) => (answer = resolve)));
    __setAgeRangeDepsForTests(deps({ request }));

    await launch();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: false });

    const asked = ensureAgeBucket();
    await until(() => request.mock.calls.length > 0);
    expect(useAgeStore.getState().settled).toBe(false);
    answer(UNDER_13);
    await asked;

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it.each([
    ['(null, 12)', { lowerBound: null, upperBound: 12 }],
    ['(null, 13)', { lowerBound: null, upperBound: 13 }],
    ['(12, 13)', { lowerBound: 12, upperBound: 13 }],
  ])('an answer of %s turns the rule on', async (_name, band) => {
    __setAgeRangeDepsForTests(deps({ request: async () => band }));
    await launch();

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('a stored read that fails reads as no band', async () => {
    setDbForTests(null);
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: false });
  });

  it('re-asks for a stored under-13 band, once per process', async () => {
    await saveAgeBucket(UNDER_13);
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    await ensureAgeBucket();
    await ensureAgeBucket();

    expect(request).toHaveBeenCalledTimes(1);
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it.each([
    ['13–15', TEEN],
    ['18+', ADULT],
  ])('a %s answer to a stored under-13 band lifts the rule and replaces the band', async (_name, band) => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: async () => band }));
    await launch();
    expect(useAgeStore.getState().localOnly).toBe(true);

    await expect(ensureAgeBucket()).resolves.toEqual(band);

    expect(useAgeStore.getState()).toMatchObject({ bucket: band, localOnly: false, settled: true });
    expect(await getAgeBucket()).toEqual(band);
  });

  it.each([
    ['a decline', declined()],
    [
      '"not available"',
      jest.fn(async () => {
        throw Object.assign(new Error('n/a'), { code: 'ERR_AGE_RANGE_NOT_AVAILABLE' });
      }),
    ],
    [
      'a throw',
      jest.fn(async () => {
        throw new Error('boom');
      }),
    ],
    ['an answer that is not a band', jest.fn(async () => ({ lowerBound: 15, upperBound: 13 }))],
    ['an answer with no bounds', jest.fn(async () => ({ lowerBound: null, upperBound: null }))],
  ])('%s keeps a stored under-13 band and the rule', async (_name, request) => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toEqual(UNDER_13);

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it('always settles, even when applying the answer throws', async () => {
    __setAgeRangeDepsForTests(deps({ request: async () => ADULT }));
    await launch();
    // The store's reset restores its state, not its actions: put it back after.
    const accept = useAgeStore.getState().accept;
    useAgeStore.setState({
      accept: () => {
        throw new Error('store exploded');
      },
    });
    try {
      await expect(ensureAgeBucket()).resolves.toBeNull();
      expect(useAgeStore.getState().settled).toBe(true);
    } finally {
      useAgeStore.setState({ accept });
    }
  });

  it('always settles when the availability check throws', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    __setAgeRangeDepsForTests({
      isAvailable: () => {
        throw new Error('seam exploded');
      },
      request: jest.fn(),
    });

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(useAgeStore.getState().settled).toBe(true);
  });

  it('reads the stored band once per process: a second call changes nothing', async () => {
    __setAgeRangeDepsForTests(deps({ request: async () => ADULT }));
    await launch();
    await ensureAgeBucket();
    expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });

    await hydrateAgeGate();

    // Still settled: nothing would ever settle it again in this run.
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
  });

  it('a stored under-13 band applies even when the ask runs without the launch read', async () => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
  });

  it('a launch read that finishes after the ask started is ignored', async () => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: async () => TEEN }));

    const reading = hydrateAgeGate();
    await ensureAgeBucket();
    await reading;

    expect(useAgeStore.getState()).toMatchObject({ bucket: TEEN, localOnly: false, settled: true });
  });

  it('what waits for the answer goes on once it is in', async () => {
    __setAgeRangeDepsForTests(deps({ request: async () => ADULT }));
    await launch();
    let released = false;
    const waiting = whenAgeSettled().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);

    await ensureAgeBucket();
    await waiting;
    expect(released).toBe(true);
  });
});

describe('recheckAgeBucketIfDue', () => {
  async function underTheRuleAfterLaunch(request: jest.Mock): Promise<number> {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    const before = Date.now();
    await ensureAgeBucket();
    return before;
  }

  it('asks again only once 24 hours have passed since the last ask', async () => {
    const request = jest.fn(async () => UNDER_13);
    const t0 = await underTheRuleAfterLaunch(request);
    expect(request).toHaveBeenCalledTimes(1);

    await expect(recheckAgeBucketIfDue(t0 + AGE_RECHECK_MIN_MS - 60_000)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    await expect(recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);

    // The repeat counts as the last ask: not again for another 24 hours.
    await expect(recheckAgeBucketIfDue(Date.now() + 60_000)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a 13+ answer on a re-ask lifts the rule', async () => {
    const request = jest.fn().mockResolvedValueOnce(UNDER_13).mockResolvedValueOnce(TEEN);
    await underTheRuleAfterLaunch(request);

    await recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS);

    expect(useAgeStore.getState()).toMatchObject({ bucket: TEEN, localOnly: false });
    expect(await getAgeBucket()).toEqual(TEEN);
  });

  it('a decline on a re-ask keeps the band and the rule', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(UNDER_13)
      .mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'ERR_AGE_RANGE_USER_DECLINED' }));
    await underTheRuleAfterLaunch(request);

    await expect(recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS)).resolves.toBe(true);

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true });
  });

  it('does nothing when the rule does not apply', async () => {
    const request = jest.fn(async () => ADULT);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    await ensureAgeBucket();
    expect(request).toHaveBeenCalledTimes(1);

    await expect(recheckAgeBucketIfDue(Date.now() + 2 * AGE_RECHECK_MIN_MS)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the launch has asked', async () => {
    await saveAgeBucket(UNDER_13);
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    await expect(recheckAgeBucketIfDue(Date.now() + 2 * AGE_RECHECK_MIN_MS)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('runs one re-ask at a time', async () => {
    let answer: (v: unknown) => void = () => {};
    const request = jest
      .fn()
      .mockResolvedValueOnce(UNDER_13)
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await underTheRuleAfterLaunch(request);

    const first = recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS);
    const second = recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS);
    expect(second).toBe(first);
    await until(() => request.mock.calls.length === 2);
    answer(UNDER_13);
    await first;

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('never rejects, whatever the time it is given', async () => {
    const request = jest.fn(async () => UNDER_13);
    await underTheRuleAfterLaunch(request);

    await expect(recheckAgeBucketIfDue(Number.NaN)).resolves.toBe(false);
    await expect(recheckAgeBucketIfDue(new Date('not a date'))).resolves.toBe(false);
  });
});

describe('declared age range on this device', () => {
  it('does not call the SDK on web, Android, or iOS before 26, and nothing waits there', async () => {
    __setAgeRangeDepsForTests(null);
    nativeRequest.mockResolvedValue({
      lowerBound: 18,
      upperBound: null,
      installId: 'synthetic',
    });

    for (const [os, version] of [
      ['web', '26.0'],
      ['android', 26],
      ['ios', '18.5'],
      ['ios', 18],
    ] as const) {
      usePlatform(os, version);
      __setAgeRangeDepsForTests(null);
      __resetAgeStoreForTests();
      nativeRequest.mockClear();

      await hydrateAgeGate();
      expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });

      await expect(ensureAgeBucket()).resolves.toBeNull();
      expect(nativeRequest).not.toHaveBeenCalled();
      expect(await getAgeBucket()).toBeNull();
    }
  });

  it('a stored under-13 band still applies where the API cannot run, and nothing waits', async () => {
    usePlatform('ios', '18.5');
    __setAgeRangeDepsForTests(null);
    await saveAgeBucket(UNDER_13);

    await hydrateAgeGate();

    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('on iOS 26 asks with the three gates and stores only the band', async () => {
    usePlatform('ios', '26.1');
    __setAgeRangeDepsForTests(null);
    nativeRequest.mockResolvedValue({
      lowerBound: null,
      upperBound: 13,
      ageRangeDeclaration: 'selfDeclared',
      activeParentalControls: ['communicationLimits'],
      installId: 'not-stored',
      userStatus: 'VERIFIED',
      mostRecentApprovalDate: 5,
    });

    await hydrateAgeGate();
    expect(useAgeStore.getState().settled).toBe(false);
    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: null, upperBound: 13 });

    expect(nativeRequest).toHaveBeenCalledTimes(1);
    expect(nativeRequest).toHaveBeenCalledWith({
      threshold1: 13,
      threshold2: 16,
      threshold3: 18,
    });
    expect(await getDb().get(`SELECT * FROM age_bucket`)).toEqual({
      id: 'me',
      lower_bound: null,
      upper_bound: 13,
    });
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('on iOS 26 an answer of (null, 12) is stored and turns the rule on', async () => {
    usePlatform('ios', '26.2');
    __setAgeRangeDepsForTests(null);
    nativeRequest.mockResolvedValue({ lowerBound: null, upperBound: 12, ageRangeDeclaration: 'guardianDeclared' });

    await hydrateAgeGate();
    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: null, upperBound: 12 });

    expect(await getDb().get(`SELECT * FROM age_bucket`)).toEqual({
      id: 'me',
      lower_bound: null,
      upper_bound: 12,
    });
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });
});

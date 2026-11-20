import { Platform } from 'react-native';

import * as ageBucketDb from '@/db/ageBucket';
import { getAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import { getDb, setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, uploadsMayStart, useAgeStore, whenAgeSettled } from '@/store/ageStore';

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

  // The band belongs to the install, not to the Apple Account (review
  // 2026-11-19, item 1): a stored band of 13 or over is asked about too.
  it('asks about a stored band of 13 or over too, once per launch, and keeps a new answer', async () => {
    await saveAgeBucket({ lowerBound: 13, upperBound: 16 });
    const request = jest.fn(async () => ({ lowerBound: 18, upperBound: null }));
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: 18, upperBound: null });
    await ensureAgeBucket();

    expect(request).toHaveBeenCalledTimes(1);
    expect(await getAgeBucket()).toEqual({ lowerBound: 18, upperBound: null });
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

    // The read fails, so the run goes by the band already in the store.
    await expect(ensureAgeBucket()).resolves.toEqual(UNDER_13);
    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
  });
});

describe('the under-13 rule (D70)', () => {
  it('a stored under-13 band turns the rule on at launch, before anything is asked', async () => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => UNDER_13) }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: false });
  });

  it('no stored band on a phone that cannot ask: settled at once, nothing asked', async () => {
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, request }));

    await launch();
    await ensureAgeBucket();

    expect(request).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: true });
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

  // A read that throws is no longer read as no band (review 2026-11-19,
  // item 4: "a stored band that can't be read" below). A missing row still is.
  it('a missing row is no band: open, and unsettled until the answer on a phone that can ask', async () => {
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

// Review 2026-11-19, item 1. The band belongs to the install, not to the
// Apple Account: a parent's phone handed to a child by switching accounts, or
// an app restored from a backup, keeps the adult band. So a stored band of 13
// or over is asked about too, in the background, with the store settled from
// the start: an adult waits for nothing.
describe('a stored band of 13 or over is asked about in the background', () => {
  it('stored (18, null), Apple answers (null, 12): the rule comes on and the band is kept', async () => {
    await saveAgeBucket(ADULT);
    let answer: (v: unknown) => void = () => {};
    const request = jest.fn(() => new Promise((resolve) => (answer = resolve)));
    __setAgeRangeDepsForTests(deps({ request }));

    await launch();
    // Nothing waits: settled from the start, uploads may start.
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });

    const asked = ensureAgeBucket();
    await until(() => request.mock.calls.length > 0);
    expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });
    answer(UNDER_13);
    await expect(asked).resolves.toEqual(UNDER_13);

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it('stored (18, null), Apple answers (18, null): nothing changes, nothing is written, nothing waited', async () => {
    await saveAgeBucket(ADULT);
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => ADULT) }));
    await launch();
    const notified = jest.fn();
    const unsubscribe = useAgeStore.subscribe(notified);
    const write = jest.spyOn(ageBucketDb, 'saveAgeBucket');
    try {
      await expect(ensureAgeBucket()).resolves.toEqual(ADULT);
    } finally {
      unsubscribe();
    }

    // markSettled on a settled store is no change either.
    expect(notified).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
  });

  it('stored (18, null), Apple answers another band of 13 or over: it replaces the stored one, the gate stays open', async () => {
    await saveAgeBucket(ADULT);
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => TEEN) }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toEqual(TEEN);

    expect(useAgeStore.getState()).toMatchObject({ bucket: TEEN, localOnly: false, settled: true });
    expect(await getAgeBucket()).toEqual(TEEN);
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
      'an error',
      jest.fn(async () => {
        throw new Error('boom');
      }),
    ],
    ['an answer that is not a band', jest.fn(async () => ({ lowerBound: null, upperBound: null }))],
  ])('stored (18, null), %s: the stored band stays and nothing changes', async (_name, request) => {
    await saveAgeBucket(ADULT);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toEqual(ADULT);

    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
    expect(await getAgeBucket()).toEqual(ADULT);
  });

  it('an ask that never answers delays nothing: settled, uploads may start, nothing waits', async () => {
    await saveAgeBucket(ADULT);
    const request = jest.fn(() => new Promise(() => {}));
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    void ensureAgeBucket();
    await until(() => request.mock.calls.length > 0);

    expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });
    expect(uploadsMayStart()).toBe(true);
    let released = false;
    await whenAgeSettled().then(() => {
      released = true;
    });
    expect(released).toBe(true);
  });

  it('where the API cannot run, a stored band of 13 or over is never asked about', async () => {
    await saveAgeBucket(ADULT);
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, request }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toEqual(ADULT);

    expect(request).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
  });
});

// Review 2026-11-19, item 4. A read that throws is not "no band": the row may
// say under 13. The gate stays shut for the run unless Apple answers 13 or
// over (lifted through `accept`, once that answer is saved). A row that isn't
// a band (a damaged database: every write is a checked band) reads the same.
describe("a stored band that can't be read", () => {
  /**
   * The next read of the stored band throws, and so does the one more read
   * that follows it (review round 2, item 2: a read that throws is read once
   * more before it counts as unknown).
   */
  function readThrowsTwice(): void {
    jest
      .spyOn(ageBucketDb, 'getAgeBucket')
      .mockRejectedValueOnce(new Error('disk I/O error'))
      .mockRejectedValueOnce(new Error('disk I/O error'));
  }

  it('closes the gate at launch, unsettled on a phone that can ask', async () => {
    readThrowsTwice();
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: false });
    expect(uploadsMayStart()).toBe(false);
  });

  it('Apple answering 13 or over lifts it, once the answer is saved', async () => {
    readThrowsTwice();
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => ADULT) }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toEqual(ADULT);

    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
    expect(await getAgeBucket()).toEqual(ADULT);
  });

  it('Apple answering under 13 keeps it shut', async () => {
    readThrowsTwice();
    __setAgeRangeDepsForTests(deps({ request: jest.fn(async () => UNDER_13) }));
    await launch();

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
  });

  it.each([
    ['a decline', declined()],
    [
      'an error',
      jest.fn(async () => {
        throw new Error('boom');
      }),
    ],
    ['an answer that is not a band', jest.fn(async () => ({ lowerBound: 15, upperBound: 13 }))],
  ])('%s keeps it shut for the run', async (_name, request) => {
    readThrowsTwice();
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();

    await expect(ensureAgeBucket()).resolves.toBeNull();

    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  // iOS 26 with the module missing: it can't ask now, but an earlier build may
  // have stored a band, so a read that fails still closes the gate.
  it("where the API can't run now but a band could have been stored, it stays shut for the run, and nothing waits", async () => {
    readThrowsTwice();
    const request = jest.fn(async () => ADULT);
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, couldEverAsk: () => true, request }));

    await launch();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: true });

    await ensureAgeBucket();
    expect(request).not.toHaveBeenCalled();
    expect(useAgeStore.getState().localOnly).toBe(true);
  });

  it('no subscriber ever sees the gate open and settled on the way', async () => {
    readThrowsTwice();
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, couldEverAsk: () => true, request: jest.fn() }));
    const seen: boolean[] = [];
    const unsubscribe = useAgeStore.subscribe((s) => seen.push(s.settled && !s.localOnly));
    try {
      await launch();
    } finally {
      unsubscribe();
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(true);
  });

  // Review round 2, item 2: was "closes the gate too". Between the launch's
  // read and this one nothing could have added a row (`accept` runs later),
  // so the launch's read stands.
  it('a read that fails during the ask, after a launch read that found no row, goes by that: no band, open, and Apple is asked', async () => {
    const request = declined();
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    expect(useAgeStore.getState().localOnly).toBe(false);
    readThrowsTwice();

    await expect(ensureAgeBucket()).resolves.toBeNull();

    expect(request).toHaveBeenCalledTimes(1);
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: true });
  });

  it('… but a row that is not a band, found during the ask after a launch read that found none, closes the gate', async () => {
    __setAgeRangeDepsForTests(deps({ request: declined() }));
    await launch();
    await getDb().run(`INSERT INTO age_bucket (id, lower_bound, upper_bound) VALUES ('me', NULL, 500)`);

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('… and a read that fails during the ask with no launch read before it closes the gate', async () => {
    __setAgeRangeDepsForTests(deps({ request: declined() }));
    readThrowsTwice();

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
  });

  it('a read that fails during the ask, after the launch read found a band, goes by that band', async () => {
    await saveAgeBucket(ADULT);
    __setAgeRangeDepsForTests(deps({ request: declined() }));
    await launch();
    readThrowsTwice();

    await expect(ensureAgeBucket()).resolves.toEqual(ADULT);

    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
  });

  it('… and an under-13 band found at launch still applies', async () => {
    await saveAgeBucket(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request: declined() }));
    await launch();
    readThrowsTwice();

    await ensureAgeBucket();

    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
  });

  it('a row that is not a band reads the same as one that cannot be read', async () => {
    // The table's checks refuse an empty or reversed pair; a bound past 120
    // gets past them but isn't a band the app would ever have written.
    await getDb().run(`INSERT INTO age_bucket (id, lower_bound, upper_bound) VALUES ('me', NULL, 500)`);
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: false });
  });
});

// Review round 2, item 2. A momentary read failure used to count like an
// under-13 band, and closing the gate has lasting side effects (the guest's
// usage-notice stamp forgotten, the queue cleared, sign-in refused for the
// run). A read that throws is now read once more; and where Apple's API can
// never run, no band can be stored, so a failed read is no band.
describe('a read that fails for a moment', () => {
  function readThrowsOnce(): jest.SpyInstance {
    return jest.spyOn(ageBucketDb, 'getAgeBucket').mockRejectedValueOnce(new Error('database is locked'));
  }

  it.each([
    ['a stored band of 13 or over: open, settled, nothing waits', ADULT, { bucket: ADULT, localOnly: false, settled: true }],
    ['a stored under-13 band: the rule, from the band itself', UNDER_13, { bucket: UNDER_13, localOnly: true, settled: false }],
    ['no row: no band, open, waiting for the answer', null, { bucket: null, localOnly: false, settled: false }],
  ])('is read once more at launch, and the row decides: %s', async (_name, stored, expected) => {
    if (stored) await saveAgeBucket(stored);
    const read = readThrowsOnce();
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await launch();

    expect(read).toHaveBeenCalledTimes(2);
    expect(useAgeStore.getState()).toMatchObject(expected);
  });

  it('is read once more during the ask too: a stored band of 13 or over keeps the gate open', async () => {
    await saveAgeBucket(ADULT);
    __setAgeRangeDepsForTests(deps({ request: declined() }));
    const read = readThrowsOnce();

    // The run goes by the band it read the second time (a decline keeps it).
    await expect(ensureAgeBucket()).resolves.toEqual(ADULT);

    expect(read).toHaveBeenCalledTimes(2);
    expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });
  });

  it('two failures in a row still close the gate where a band could be stored', async () => {
    jest
      .spyOn(ageBucketDb, 'getAgeBucket')
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockRejectedValueOnce(new Error('database is locked'));
    __setAgeRangeDepsForTests(deps({ request: declined() }));

    await launch();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: false });
  });
});

describe("where Apple's API can never run", () => {
  function readAlwaysThrows(): void {
    jest.spyOn(ageBucketDb, 'getAgeBucket').mockRejectedValue(new Error('disk I/O error'));
  }

  it.each([
    ['web', 'web', '26.0'],
    ['Android', 'android', 26],
    ['iOS before 26', 'ios', '18.5'],
  ] as const)('a read that fails is no band (%s): open, settled, nothing asked', async (_name, os, version) => {
    usePlatform(os, version);
    __setAgeRangeDepsForTests(null);
    readAlwaysThrows();

    await hydrateAgeGate();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: true });

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(nativeRequest).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: true });
  });

  it('the same through a seam that says it cannot ask and has no couldEverAsk', async () => {
    readAlwaysThrows();
    const request = jest.fn(async () => UNDER_13);
    __setAgeRangeDepsForTests(deps({ isAvailable: () => false, request }));

    await launch();
    await ensureAgeBucket();

    expect(request).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: false, settled: true });
  });

  it('a row that is present but is not a band still closes the gate', async () => {
    usePlatform('ios', '18.5');
    __setAgeRangeDepsForTests(null);
    await getDb().run(`INSERT INTO age_bucket (id, lower_bound, upper_bound) VALUES ('me', NULL, 500)`);

    await hydrateAgeGate();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: true });
  });

  it('on iOS 26 a read that fails twice closes the gate, whatever the module', async () => {
    usePlatform('ios', '26.1');
    __setAgeRangeDepsForTests(null);
    readAlwaysThrows();

    await hydrateAgeGate();

    expect(useAgeStore.getState()).toMatchObject({ bucket: null, localOnly: true, settled: false });
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

  it('does nothing with no band and no rule (a decline at launch)', async () => {
    const request = declined();
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    await ensureAgeBucket();
    expect(request).toHaveBeenCalledTimes(1);

    await expect(recheckAgeBucketIfDue(Date.now() + 2 * AGE_RECHECK_MIN_MS)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  // Review 2026-11-19, item 1: a known band of 13 or over is asked about
  // again in a long run, the same way.
  it('asks again about a known band of 13 or over after 24 hours, and an under-13 answer turns the rule on', async () => {
    await saveAgeBucket(ADULT);
    const request = jest.fn().mockResolvedValueOnce(ADULT).mockResolvedValueOnce(UNDER_13);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    const t0 = Date.now();
    await ensureAgeBucket();
    expect(useAgeStore.getState().localOnly).toBe(false);

    await expect(recheckAgeBucketIfDue(t0 + AGE_RECHECK_MIN_MS - 60_000)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    await expect(recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(useAgeStore.getState()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it('a re-ask about a known band of 13 or over that comes back the same changes nothing', async () => {
    await saveAgeBucket(ADULT);
    const request = jest.fn(async () => ADULT);
    __setAgeRangeDepsForTests(deps({ request }));
    await launch();
    await ensureAgeBucket();
    const notified = jest.fn();
    const unsubscribe = useAgeStore.subscribe(notified);
    try {
      await expect(recheckAgeBucketIfDue(Date.now() + AGE_RECHECK_MIN_MS)).resolves.toBe(true);
    } finally {
      unsubscribe();
    }

    expect(request).toHaveBeenCalledTimes(2);
    expect(notified).not.toHaveBeenCalled();
    expect(useAgeStore.getState()).toMatchObject({ bucket: ADULT, localOnly: false, settled: true });
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

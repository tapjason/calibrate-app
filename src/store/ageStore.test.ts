import { getAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import { getDb, setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';

import {
  __resetAgeStoreForTests,
  isLocalOnly,
  uploadsMayStart,
  useAgeStore,
  whenAgeSettled,
} from './ageStore';

const UNDER_13 = { lowerBound: null, upperBound: 12 };
const TEEN = { lowerBound: 13, upperBound: 15 };
const ADULT = { lowerBound: 18, upperBound: null };

const age = () => useAgeStore.getState();

/** Lets queued promise callbacks run. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetAgeStoreForTests();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  __resetAgeStoreForTests();
  setDbForTests(null);
});

describe('ageStore: defaults (D70)', () => {
  it('is today’s app: no band, not local-only, settled', () => {
    expect(age()).toMatchObject({ bucket: null, localOnly: false, settled: true });
    expect(isLocalOnly()).toBe(false);
    expect(uploadsMayStart()).toBe(true);
  });
});

describe('ageStore.load', () => {
  it('turns the rule on for a stored under-13 band, settled when this launch will not ask', () => {
    age().load(UNDER_13, { willAsk: false });
    expect(age()).toMatchObject({ bucket: UNDER_13, localOnly: true, settled: true });
    expect(isLocalOnly()).toBe(true);
    expect(uploadsMayStart()).toBe(false);
  });

  it('holds uploads back on a launch that will ask', () => {
    age().load(null, { willAsk: true });
    expect(age()).toMatchObject({ bucket: null, localOnly: false, settled: false });
    expect(uploadsMayStart()).toBe(false);
    age().markSettled();
    expect(uploadsMayStart()).toBe(true);
  });

  it('leaves the rule off for a band of 13 or over', () => {
    age().load(TEEN, { willAsk: false });
    expect(isLocalOnly()).toBe(false);
    age().load(ADULT, { willAsk: false });
    expect(isLocalOnly()).toBe(false);
  });

  // Fails closed: only Apple's own answer, saved, lifts the rule.
  it('never lifts a rule already on in this run', () => {
    age().load(UNDER_13, { willAsk: false });
    age().load(ADULT, { willAsk: false });
    expect(age()).toMatchObject({ bucket: ADULT, localOnly: true });
    age().load(null, { willAsk: false });
    expect(isLocalOnly()).toBe(true);
  });
});

describe('ageStore.accept', () => {
  it('saves an under-13 band and turns the rule on', async () => {
    await expect(age().accept(UNDER_13)).resolves.toBe(true);
    expect(age()).toMatchObject({ bucket: UNDER_13, localOnly: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it('lifts the rule on a 13+ band, once it is saved', async () => {
    await saveAgeBucket(UNDER_13);
    age().load(UNDER_13, { willAsk: true });
    expect(isLocalOnly()).toBe(true);

    await expect(age().accept(TEEN)).resolves.toBe(true);
    expect(age()).toMatchObject({ bucket: TEEN, localOnly: false });
    expect(await getAgeBucket()).toEqual(TEEN);
    // Settling is the caller's (ensureAgeBucket ends in markSettled).
    expect(age().settled).toBe(false);
    age().markSettled();
    expect(uploadsMayStart()).toBe(true);
  });

  it('closes the gate before the save lands', async () => {
    const db = getDb();
    const realRun = db.run.bind(db);
    let release: () => void = () => {};
    db.run = async (sql, params) => {
      if (sql.includes('age_bucket')) await new Promise<void>((r) => (release = r));
      return realRun(sql, params);
    };

    const saving = age().accept(UNDER_13);
    expect(isLocalOnly()).toBe(true);
    release();
    await expect(saving).resolves.toBe(true);
    db.run = realRun;
  });

  it('keeps an under-13 answer for the run when it cannot be saved', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (sql.includes('age_bucket')) throw new Error('disk full');
      return realRun(sql, params);
    };

    await expect(age().accept(UNDER_13)).resolves.toBe(false);
    db.run = realRun;
    expect(age()).toMatchObject({ bucket: UNDER_13, localOnly: true });
    expect(await getAgeBucket()).toBeNull();
    // The log carries the error's message, never the band.
    expect(warn).toHaveBeenCalledWith('[age] could not keep the age range:', 'disk full');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/12|upperBound/);
  });

  it('lifts nothing when a 13+ band cannot be saved: the stored band still stands', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await saveAgeBucket(UNDER_13);
    age().load(UNDER_13, { willAsk: true });
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (sql.includes('age_bucket')) throw new Error('disk full');
      return realRun(sql, params);
    };

    await expect(age().accept(ADULT)).resolves.toBe(false);
    db.run = realRun;
    expect(age()).toMatchObject({ bucket: UNDER_13, localOnly: true });
    expect(await getAgeBucket()).toEqual(UNDER_13);
  });

  it('lifts nothing when the band was forgotten while a 13+ answer was being saved', async () => {
    age().load(UNDER_13, { willAsk: true });
    const db = getDb();
    const realRun = db.run.bind(db);
    let release: () => void = () => {};
    db.run = async (sql, params) => {
      if (sql.includes('INSERT INTO age_bucket')) await new Promise<void>((r) => (release = r));
      return realRun(sql, params);
    };

    const saving = age().accept(ADULT);
    await flush();
    age().forgetBand();
    release();
    await saving;
    db.run = realRun;
    expect(isLocalOnly()).toBe(true);
  });

  it('a later under-13 answer wins over an earlier 13+ one still being saved', async () => {
    const db = getDb();
    const realRun = db.run.bind(db);
    const held: Array<() => void> = [];
    db.run = async (sql, params) => {
      if (sql.includes('INSERT INTO age_bucket')) await new Promise<void>((r) => held.push(r));
      return realRun(sql, params);
    };

    const first = age().accept(ADULT);
    await flush();
    const second = age().accept(UNDER_13);
    await flush();
    held.forEach((r) => r());
    await Promise.all([first, second]);
    db.run = realRun;
    expect(isLocalOnly()).toBe(true);
  });
});

describe('ageStore.forgetBand', () => {
  // Call 4: Erase and account deletion clear the stored band, and the gate
  // stays on for the rest of the run.
  it('forgets the band and keeps the rule on for the run', async () => {
    await age().accept(UNDER_13);
    age().forgetBand();
    expect(age()).toMatchObject({ bucket: null, localOnly: true });
    expect(isLocalOnly()).toBe(true);
  });

  it('changes nothing else for a phone the rule does not cover', () => {
    age().load(ADULT, { willAsk: false });
    age().forgetBand();
    expect(age()).toMatchObject({ bucket: null, localOnly: false, settled: true });
  });
});

describe('whenAgeSettled', () => {
  it('resolves at once when nothing is being asked', async () => {
    jest.useFakeTimers();
    await expect(whenAgeSettled(5000)).resolves.toBeUndefined();
    await expect(whenAgeSettled()).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolves on markSettled, and leaves no timer behind', async () => {
    jest.useFakeTimers();
    age().load(null, { willAsk: true });
    let done = false;
    const waiting = whenAgeSettled(5000).then(() => {
      done = true;
    });
    expect(jest.getTimerCount()).toBe(1);
    await Promise.resolve();
    expect(done).toBe(false);

    age().markSettled();
    await waiting;
    expect(done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolves at its cap when Apple never answers', async () => {
    jest.useFakeTimers();
    age().load(null, { willAsk: true });
    let done = false;
    const waiting = whenAgeSettled(5000).then(() => {
      done = true;
    });

    jest.advanceTimersByTime(4999);
    await Promise.resolve();
    expect(done).toBe(false);
    jest.advanceTimersByTime(1);
    await waiting;
    expect(done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    // Still unsettled: the cap only stops the wait.
    expect(age().settled).toBe(false);
    // A later markSettled is harmless.
    age().markSettled();
  });

  it('with no cap, waits for markSettled alone and sets no timer', async () => {
    jest.useFakeTimers();
    age().load(UNDER_13, { willAsk: true });
    let done = false;
    const waiting = whenAgeSettled().then(() => {
      done = true;
    });
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60 * 60 * 1000);
    await Promise.resolve();
    expect(done).toBe(false);

    age().markSettled();
    await waiting;
    expect(done).toBe(true);
  });

  it.each([[0], [-5]])('resolves at once with a cap of %p', async (cap) => {
    jest.useFakeTimers();
    age().load(null, { willAsk: true });
    await expect(whenAgeSettled(cap)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY]])(
    'treats a cap of %p as none, rather than firing at once',
    async (cap) => {
      jest.useFakeTimers();
      age().load(null, { willAsk: true });
      let done = false;
      const waiting = whenAgeSettled(cap).then(() => {
        done = true;
      });
      expect(jest.getTimerCount()).toBe(0);
      await Promise.resolve();
      expect(done).toBe(false);
      age().markSettled();
      await waiting;
      expect(done).toBe(true);
    },
  );

  it('releases every waiter on one markSettled, each timer cleared', async () => {
    jest.useFakeTimers();
    age().load(null, { willAsk: true });
    const waits = [whenAgeSettled(5000), whenAgeSettled(1000), whenAgeSettled()];
    expect(jest.getTimerCount()).toBe(2);
    age().markSettled();
    await expect(Promise.all(waits)).resolves.toEqual([undefined, undefined, undefined]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('is not released by a change that leaves it unsettled', async () => {
    jest.useFakeTimers();
    age().load(null, { willAsk: true });
    let done = false;
    const waiting = whenAgeSettled(5000).then(() => {
      done = true;
    });
    // Apple's answer arrives and is applied before ensureAgeBucket settles.
    useAgeStore.setState({ localOnly: true, bucket: UNDER_13 });
    await Promise.resolve();
    expect(done).toBe(false);
    age().markSettled();
    await waiting;
    expect(done).toBe(true);
    expect(isLocalOnly()).toBe(true);
  });
});

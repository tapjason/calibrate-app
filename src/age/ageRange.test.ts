import { Platform } from 'react-native';

import { getAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import { getDb, setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';

import {
  __setAgeRangeDepsForTests,
  ensureAgeBucket,
  type AgeRangeDeps,
} from './ageRange';

jest.mock('expo-age-range', () => ({
  requestAgeRangeAsync: jest.fn(),
}));

import * as AgeRange from 'expo-age-range';

const nativeRequest = AgeRange.requestAgeRangeAsync as jest.Mock;
const originalOS = Platform.OS;
const originalVersion = Platform.Version;

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

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __setAgeRangeDepsForTests(null);
  nativeRequest.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  usePlatform(originalOS, originalVersion);
  __setAgeRangeDepsForTests(null);
  setDbForTests(null);
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
  });

  it('stays open when the person declines', async () => {
    const request = jest.fn(async () => {
      throw Object.assign(new Error('declined'), { code: 'ERR_AGE_RANGE_USER_DECLINED' });
    });
    __setAgeRangeDepsForTests(deps({ request }));

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
    __setAgeRangeDepsForTests(
      deps({
        request: async () => ({ lowerBound: 18, upperBound: null }),
      }),
    );

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
    const request = jest.fn(async () => {
      throw Object.assign(new Error('declined'), { code: 'ERR_AGE_RANGE_USER_DECLINED' });
    });
    __setAgeRangeDepsForTests(deps({ request }));

    await ensureAgeBucket();
    await ensureAgeBucket();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask again once a band is stored', async () => {
    await saveAgeBucket({ lowerBound: 13, upperBound: 16 });
    const request = jest.fn(async () => ({ lowerBound: 18, upperBound: null }));
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toEqual({ lowerBound: 13, upperBound: 16 });
    await ensureAgeBucket();

    expect(request).not.toHaveBeenCalled();
  });

  it('does not ask or throw when the database is not open', async () => {
    setDbForTests(null);
    const request = jest.fn(async () => ({ lowerBound: 18, upperBound: null }));
    __setAgeRangeDepsForTests(deps({ request }));

    await expect(ensureAgeBucket()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('declared age range on this device', () => {
  it('does not call the SDK on web, Android, or iOS before 26', async () => {
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
      nativeRequest.mockClear();

      await expect(ensureAgeBucket()).resolves.toBeNull();
      expect(nativeRequest).not.toHaveBeenCalled();
      expect(await getAgeBucket()).toBeNull();
    }
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
  });
});

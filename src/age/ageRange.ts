// Declared Age Range (L5). The only module that talks to expo-age-range.
//
// One ask per process, after the first screen is up, and never again once a
// band is stored. Everywhere the API cannot run — web, Android, iOS before
// 26, the native module missing — or wherever it throws, including a
// decline and "not available" (not signed in, or a region where Apple does
// not offer it), this resolves to "no band" and the app continues as it
// does today. Nothing here is awaited on the launch path, and nothing in
// the app reads the band to lock a feature.
//
// The SDK's own fallback on web and older iOS is a fake adult
// (`lowerBound: 18`). That is not a declaration. This module does not call
// the API there, so the fake is never stored.
//
// Apple drops a revoked consent by refusing to launch the app, so there is
// no server call and no rescind handler.

import { Platform } from 'react-native';

import { getAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import type { AgeBucket } from '@/types';

/**
 * Apple's sample gates, each at least two years apart (closer than that is
 * an invalid request). The app is rated 4+ and does not change what a
 * person can do based on the band these return.
 */
const AGE_GATES = { threshold1: 13, threshold2: 16, threshold3: 18 } as const;

/** What the seam needs. Tests pass a fake; production loads the module. */
export interface AgeRangeDeps {
  /** False when this device cannot actually ask Apple. */
  isAvailable(): boolean;
  /** The raw API response. May carry fields we must not store. */
  request(): Promise<unknown>;
}

let override: AgeRangeDeps | null = null;
let pending: Promise<AgeBucket | null> | null = null;

function iosMajor(): number | null {
  if (Platform.OS !== 'ios') return null;
  const raw = Platform.Version;
  const major =
    typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw), 10);
  return Number.isFinite(major) ? major : null;
}

function loadModule(): { requestAgeRangeAsync?: (options: typeof AGE_GATES) => Promise<unknown> } | null {
  try {
    // Lazy require: the package is absent in Jest, and on web its entry
    // returns a fake adult instead of failing. Callers check the OS first.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-age-range') as {
      requestAgeRangeAsync?: (options: typeof AGE_GATES) => Promise<unknown>;
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] module unavailable:', e);
    return null;
  }
}

function defaultDeps(): AgeRangeDeps {
  return {
    isAvailable() {
      // iOS 26 is the first OS with Declared Age Range. Earlier versions
      // (and web, and Android) must not be asked: the SDK answers those
      // with a synthetic 18, which is not the person's age.
      const major = iosMajor();
      if (major === null || major < 26) return false;
      const mod = loadModule();
      return typeof mod?.requestAgeRangeAsync === 'function';
    },
    async request() {
      const mod = loadModule();
      if (!mod?.requestAgeRangeAsync) {
        throw new Error('Declared Age Range is not available');
      }
      return await mod.requestAgeRangeAsync(AGE_GATES);
    },
  };
}

function getDeps(): AgeRangeDeps {
  return override ?? defaultDeps();
}

const INVALID = Symbol('invalid-bound');

function bound(value: unknown): number | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 120) {
    return INVALID;
  }
  return value;
}

/**
 * The two bounds, or null when this response is not a band we can keep.
 * Extra fields on the object are ignored.
 */
function bucketFromResponse(raw: unknown): AgeBucket | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const lower = bound(rec.lowerBound);
  const upper = bound(rec.upperBound);
  if (lower === INVALID || upper === INVALID) return null;
  if (lower === null && upper === null) return null;
  if (lower !== null && upper !== null && lower >= upper) return null;
  return { lowerBound: lower, upperBound: upper };
}

async function run(): Promise<AgeBucket | null> {
  try {
    const existing = bucketFromResponse(await getAgeBucket());
    if (existing) return existing;
  } catch (e) {
    // Can't tell whether we already asked. Don't prompt, don't throw.
    // eslint-disable-next-line no-console
    console.warn('[age] read failed:', e);
    return null;
  }

  const deps = getDeps();
  if (!deps.isAvailable()) return null;

  let raw: unknown;
  try {
    raw = await deps.request();
  } catch (e) {
    // Decline, not signed in, a region that doesn't offer it, or a bug.
    // eslint-disable-next-line no-console
    console.warn('[age] request failed:', e);
    return null;
  }

  const bucket = bucketFromResponse(raw);
  if (!bucket) return null;

  try {
    await saveAgeBucket(bucket);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] save failed:', e);
    return null;
  }
  return bucket;
}

/**
 * Ask once, if we don't already have a band. Always resolves. A stored band
 * is returned without asking again; every failure resolves to null.
 */
export function ensureAgeBucket(): Promise<AgeBucket | null> {
  if (!pending) {
    pending = run().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[age] check failed:', e);
      return null;
    });
  }
  return pending;
}

/** Test-only. Null returns to the real platform seam. */
export function __setAgeRangeDepsForTests(next: AgeRangeDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setAgeRangeDepsForTests is only allowed when NODE_ENV=test');
  }
  override = next;
  pending = null;
}

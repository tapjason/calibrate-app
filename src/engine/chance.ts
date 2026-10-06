// How far chance alone moves the numbers (roadmap D4, decided 2026-10-05).
//
// Two honesty measures, both pure and deterministic:
//
//   chanceRange   For one confidence bucket: if you were perfectly calibrated
//                 at the confidence you stated, where would the share that
//                 happened land? The central half of the binomial outcomes at
//                 that bucket's n. A dot inside it is as close to the diagonal
//                 as chance typically allows; small buckets get wide ranges.
//
//   bootstrapRange  For the overall rating (calibration.ts computeRatingRange):
//                 resample the resolved predictions with replacement,
//                 re-score, and keep the middle 80% of the scores, so "92"
//                 reads as "likely 88–95" with 145 resolved and as something
//                 much wider with 20.
//
// Layer rule: L3 — imports only from @/types and sibling engine files.

/** The share of binomial outcomes the chance range spans: the central half. */
export const CHANCE_MASS = 0.5;

/** The share of bootstrap scores the rating range spans: the central 80%. */
export const RATING_RANGE_MASS = 0.8;

/** Bootstrap resamples. Enough for a stable 10th and 90th percentile. */
export const RATING_RESAMPLES = 400;

export interface RateRange {
  low: number; // share 0–1
  high: number; // share 0–1
}

/**
 * The central `mass` of Binomial(n, p) outcomes, as shares of n: the smallest
 * k whose cumulative probability reaches (1 − mass)/2, and the smallest whose
 * reaches (1 + mass)/2. Computed in log space so large n can't underflow.
 */
export function chanceRange(n: number, p: number, mass = CHANCE_MASS): RateRange {
  if (n <= 0) return { low: 0, high: 0 };
  if (p <= 0) return { low: 0, high: 0 };
  if (p >= 1) return { low: 1, high: 1 };

  const lowTarget = (1 - mass) / 2;
  const highTarget = (1 + mass) / 2;
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);

  let logPmf = n * logQ; // k = 0
  let cdf = 0;
  let low: number | null = null;
  for (let k = 0; k <= n; k++) {
    cdf += Math.exp(logPmf);
    if (low === null && cdf >= lowTarget - 1e-12) low = k;
    if (cdf >= highTarget - 1e-12) return { low: (low ?? k) / n, high: k / n };
    // P(k+1) / P(k) = (n − k)/(k + 1) · p/(1 − p)
    logPmf += Math.log(n - k) - Math.log(k + 1) + logP - logQ;
  }
  return { low: (low ?? n) / n, high: 1 };
}

/** A small seeded generator (mulberry32), so the same data gives the same range. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The value at fraction q (0–1) of a sorted array, by nearest rank. */
function quantile(sorted: readonly number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

/**
 * The middle `mass` of a statistic over bootstrap resamples of `items`.
 * Generic so the engine can hand it the calibration score without a cycle.
 * Null for no items.
 */
export function bootstrapRange<T>(
  items: readonly T[],
  statistic: (sample: readonly T[]) => number,
  opts: { resamples?: number; mass?: number; seed?: number } = {},
): { low: number; high: number } | null {
  if (items.length === 0) return null;
  const resamples = opts.resamples ?? RATING_RESAMPLES;
  const mass = opts.mass ?? RATING_RANGE_MASS;
  const random = seeded(opts.seed ?? 0x9e3779b9);

  const values: number[] = [];
  const sample: T[] = new Array(items.length);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < items.length; i++) {
      sample[i] = items[Math.floor(random() * items.length)]!;
    }
    values.push(statistic(sample));
  }
  values.sort((a, b) => a - b);
  return {
    low: quantile(values, (1 - mass) / 2),
    high: quantile(values, (1 + mass) / 2),
  };
}

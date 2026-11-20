import { __setStoreReviewDepsForTests } from '@/review/ratingPrompt';
import type { Prediction } from '@/types';

import { __resetAgeStoreForTests, useAgeStore } from './ageStore';
import { usePredictionStore } from './predictionStore';
import { useRatingStore } from './ratingStore';
import { __setPersistenceForTests, useSettingsStore } from './settingsStore';

const now = new Date('2026-10-20T19:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const answered = (i: number): Prediction => ({
  id: `p${i}`,
  user_id: 'u',
  title: 't',
  category: 'work',
  confidence: 60,
  created_at: daysAgo(10),
  due_date: daysAgo(2),
  status: i % 2 ? 'resolved_yes' : 'resolved_no',
  resolved_at: daysAgo(1),
  reflection: null,
  integrity_bonus: true,
});

let requestReview: jest.Mock;

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  requestReview = jest.fn(async () => undefined);
  __setStoreReviewDepsForTests({ isAvailableAsync: async () => true, requestReview });
  useRatingStore.setState({ moment: false });
  usePredictionStore.setState({
    pending: [],
    resolved: Array.from({ length: 10 }, (_, i) => answered(i)),
  });
});

afterEach(() => {
  __setStoreReviewDepsForTests(undefined);
  __setPersistenceForTests(null);
});

describe('ratingStore (roadmap D15)', () => {
  it('asks only once a moment has been noted, and spends the moment', async () => {
    await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
    expect(requestReview).not.toHaveBeenCalled();

    useRatingStore.getState().noteMoment();
    await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(true);
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().ratingAskedAt).not.toBeNull();

    // The next focus finds no moment waiting.
    await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('spends a moment the rules turn down, so it does not come back', async () => {
    usePredictionStore.setState({ resolved: [answered(1)] });
    useRatingStore.getState().noteMoment();
    await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
    expect(useRatingStore.getState().moment).toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  // Review 2026-11-19: while this launch waits for Apple's age answer,
  // `localOnly` may not say yet, so nothing is asked and the moment is kept.
  it('keeps the moment, unasked, while this launch waits for Apple’s answer, then asks once it is in', async () => {
    useAgeStore.getState().load(null, { willAsk: true });
    try {
      useRatingStore.getState().noteMoment();
      await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
      expect(requestReview).not.toHaveBeenCalled();
      expect(useRatingStore.getState().moment).toBe(true);

      useAgeStore.getState().markSettled();
      await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(true);
      expect(requestReview).toHaveBeenCalledTimes(1);
      expect(useRatingStore.getState().moment).toBe(false);
    } finally {
      __resetAgeStoreForTests();
    }
  });

  it('spends the kept moment, unasked, once the answer puts the phone under the rule', async () => {
    // A stored band under 13 asked about again: local-only, and unsettled.
    useAgeStore.getState().load({ lowerBound: null, upperBound: 12 }, { willAsk: true });
    try {
      useRatingStore.getState().noteMoment();
      await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
      expect(useRatingStore.getState().moment).toBe(true);

      useAgeStore.getState().markSettled();
      await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
      expect(useRatingStore.getState().moment).toBe(false);
      expect(requestReview).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().ratingAskedAt).toBeNull();
    } finally {
      __resetAgeStoreForTests();
    }
  });

  it('with no question this launch (the default), asks at once as before', async () => {
    expect(useAgeStore.getState().settled).toBe(true);
    useRatingStore.getState().noteMoment();
    await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(true);
  });

  // Roadmap D70, call 6: a local-only phone is never asked.
  it('never asks on a local-only phone, and spends the moment', async () => {
    useAgeStore.getState().load({ lowerBound: null, upperBound: 12 }, { willAsk: false });
    try {
      useRatingStore.getState().noteMoment();
      await expect(useRatingStore.getState().askIfDue(now)).resolves.toBe(false);
      expect(requestReview).not.toHaveBeenCalled();
      expect(useRatingStore.getState().moment).toBe(false);
      expect(useSettingsStore.getState().ratingAskedAt).toBeNull();
    } finally {
      __resetAgeStoreForTests();
    }
  });
});

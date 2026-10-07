import { __setStoreReviewDepsForTests } from '@/review/ratingPrompt';
import type { Prediction } from '@/types';

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
});

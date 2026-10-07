import type { Prediction } from '@/types';

import {
  __setStoreReviewDepsForTests,
  ratingContextFor,
  requestRating,
  shouldAskForRating,
} from './ratingPrompt';

const now = new Date('2026-10-20T19:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const prediction = (overrides: Partial<Prediction>): Prediction => ({
  id: 'p',
  user_id: 'u',
  title: 't',
  category: 'work',
  confidence: 60,
  created_at: daysAgo(3),
  due_date: daysAgo(1),
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: true,
  ...overrides,
});

afterEach(() => __setStoreReviewDepsForTests(undefined));

describe('shouldAskForRating (roadmap D15)', () => {
  const ready = { now, firstLoggedAt: daysAgo(8), answered: 10, lastAskedAt: null };

  it('asks after a week and ten answers', () => {
    expect(shouldAskForRating(ready)).toBe(true);
  });

  it('waits for ten answers', () => {
    expect(shouldAskForRating({ ...ready, answered: 9 })).toBe(false);
  });

  it('waits a week from the first prediction', () => {
    expect(shouldAskForRating({ ...ready, firstLoggedAt: daysAgo(6) })).toBe(false);
    expect(shouldAskForRating({ ...ready, firstLoggedAt: null })).toBe(false);
  });

  it('keeps 90 days between asks', () => {
    expect(shouldAskForRating({ ...ready, lastAskedAt: daysAgo(89) })).toBe(false);
    expect(shouldAskForRating({ ...ready, lastAskedAt: daysAgo(91) })).toBe(true);
  });
});

describe('ratingContextFor', () => {
  it('counts yes and no answers, not skips or open ones, from the first prediction', () => {
    const context = ratingContextFor(
      [
        prediction({ id: 'a', created_at: daysAgo(9), status: 'resolved_yes' }),
        prediction({ id: 'b', created_at: daysAgo(12), status: 'resolved_no' }),
        prediction({ id: 'c', status: 'skipped' }),
        prediction({ id: 'd' }),
      ],
      now,
      null,
    );
    expect(context).toEqual({ now, firstLoggedAt: daysAgo(12), answered: 2, lastAskedAt: null });
  });
});

describe('requestRating', () => {
  it('asks the system prompt when it is available', async () => {
    const requestReview = jest.fn(async () => undefined);
    __setStoreReviewDepsForTests({ isAvailableAsync: async () => true, requestReview });
    await expect(requestRating()).resolves.toBe(true);
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('does nothing where there is no prompt (web, or unavailable)', async () => {
    __setStoreReviewDepsForTests(null);
    await expect(requestRating()).resolves.toBe(false);
    const requestReview = jest.fn(async () => undefined);
    __setStoreReviewDepsForTests({ isAvailableAsync: async () => false, requestReview });
    await expect(requestRating()).resolves.toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setStoreReviewDepsForTests({
      isAvailableAsync: async () => true,
      requestReview: async () => {
        throw new Error('StoreKit unavailable');
      },
    });
    await expect(requestRating()).resolves.toBe(false);
    warn.mockRestore();
  });
});

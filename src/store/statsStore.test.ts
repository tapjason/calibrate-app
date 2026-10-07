import { setDbForTests } from '@/db/client';
import { insertPrediction, resolvePrediction } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction } from '@/types';

import { useAuthStore } from './authStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
} from './settingsStore';
import { confidenceRangeLow, coverageNudgeNow, useStatsStore } from './statsStore';

const USER = 'local-user-v1';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: USER,
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
    categoryCalibration: {},
  });
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
  __setPersistenceForTests(null);
});

describe('statsStore.recomputeForUser', () => {
  it('writes user_stats and per-category stats from raw predictions', async () => {
    // Two predictions in 'work', one resolved yes, one no, both confidence 90
    await insertPrediction(p({ id: 'a', category: 'work', confidence: 90 }));
    await insertPrediction(p({ id: 'b', category: 'work', confidence: 90 }));
    await resolvePrediction('a', 'resolved_yes');
    await resolvePrediction('b', 'resolved_no');

    // One prediction in 'health', still pending — should appear in
    // predictions_made but not predictions_resolved.
    await insertPrediction(p({ id: 'c', category: 'health', confidence: 60 }));

    await useStatsStore.getState().recomputeForUser(USER);

    const { userStat, categoryStats } = useStatsStore.getState();
    expect(userStat).not.toBeNull();
    expect(userStat?.total_predictions).toBe(3);
    expect(userStat?.total_resolved).toBe(2);
    // 2 resolved is far below MIN_N_OVERALL (20) → rating stays provisional.
    expect(userStat?.rating_is_provisional).toBe(true);

    const work = categoryStats.find((s) => s.category === 'work');
    expect(work?.predictions_made).toBe(2);
    expect(work?.predictions_resolved).toBe(2);
    // overconfident bucket: stated_mean=0.9 actual=0.5 → |0.9−0.5| = 0.40 → 60
    expect(work?.calibration_score).toBeCloseTo(60, 1);
    expect(work?.score_is_provisional).toBe(true);

    const health = categoryStats.find((s) => s.category === 'health');
    expect(health?.predictions_made).toBe(1);
    expect(health?.predictions_resolved).toBe(0); // still pending
  });

  // Roadmap D4: the give-or-take is computed alongside the rating.
  it('computes the rating range with the rating, and none with nothing resolved', async () => {
    await useStatsStore.getState().recomputeForUser(USER);
    expect(useStatsStore.getState().ratingRange).toBeNull();

    await insertPrediction(p({ id: 'a', confidence: 90 }));
    await insertPrediction(p({ id: 'b', confidence: 90 }));
    await resolvePrediction('a', 'resolved_yes');
    await resolvePrediction('b', 'resolved_no');
    await useStatsStore.getState().recomputeForUser(USER);
    const range = useStatsStore.getState().ratingRange;
    expect(range).not.toBeNull();
    expect(range!.low).toBeLessThanOrEqual(60);
    expect(range!.high).toBeGreaterThanOrEqual(60);
  });

  it('assigns badge levels according to the calibration table', async () => {
    // 25 resolved predictions in work, all confidence 100 + resolved_yes
    // → perfect calibration → score = 100. Sharp requires ≥50 resolved and
    // oracle ≥100, so 25 resolutions caps the badge at 'forecaster' (score >70
    // AND ≥20 resolved). 25 ≥ MIN_N_CATEGORY (15) so the score is not provisional.
    for (let i = 0; i < 25; i++) {
      await insertPrediction(
        p({ id: `w${i}`, category: 'work', confidence: 100 }),
      );
      await resolvePrediction(`w${i}`, 'resolved_yes');
    }
    await useStatsStore.getState().recomputeForUser(USER);

    const { categoryStats } = useStatsStore.getState();
    const work = categoryStats.find((s) => s.category === 'work');
    expect(work?.badge_level).toBe('forecaster');
    expect(work?.score_is_provisional).toBe(false);
  });

  it('loadForUser reads persisted stats without recomputing', async () => {
    // First recompute to populate, then mutate the in-memory store and reload.
    await insertPrediction(p({ id: 'x', category: 'work', confidence: 80 }));
    await resolvePrediction('x', 'resolved_yes');
    await useStatsStore.getState().recomputeForUser(USER);

    useStatsStore.setState({
      userStat: null,
      categoryStats: [],
      calibration: { rating: 0, buckets: [] },
    });
    await useStatsStore.getState().loadForUser(USER);

    expect(useStatsStore.getState().userStat).not.toBeNull();
    expect(useStatsStore.getState().categoryStats).toHaveLength(1);
  });

  // Stats lists the badges in this order. A launch read them alphabetically
  // and a recompute in the app's order, so the rows moved after the first log.
  it('lists categories in the same order after a launch as after a recompute', async () => {
    for (const category of ['personal', 'finance', 'work', 'health'] as const) {
      await insertPrediction(p({ id: category, category }));
    }
    await useStatsStore.getState().recomputeForUser(USER);
    const recomputed = useStatsStore.getState().categoryStats.map((s) => s.category);

    useStatsStore.setState({ categoryStats: [] });
    await useStatsStore.getState().loadForUser(USER);
    const loaded = useStatsStore.getState().categoryStats.map((s) => s.category);

    expect(recomputed).toEqual(['work', 'health', 'finance', 'personal']);
    expect(loaded).toEqual(recomputed);
  });

  it('exposes calibration buckets in store state (no L3 import needed from screens)', async () => {
    // 4 confidence-90 predictions, 2 yes / 2 no → overconfident bucket [80,100).
    for (let i = 0; i < 4; i++) {
      await insertPrediction(
        p({ id: `q${i}`, category: 'work', confidence: 90 }),
      );
      await resolvePrediction(`q${i}`, i < 2 ? 'resolved_yes' : 'resolved_no');
    }
    await useStatsStore.getState().recomputeForUser(USER);

    const { calibration } = useStatsStore.getState();
    expect(calibration.buckets).toHaveLength(1);
    expect(calibration.buckets[0].low).toBe(80);
    expect(calibration.buckets[0].total_resolved).toBe(4);
    expect(calibration.buckets[0].actual_rate).toBe(0.5);

    // loadForUser must rebuild buckets too — they're not persisted.
    useStatsStore.setState({
      userStat: null,
      categoryStats: [],
      calibration: { rating: 0, buckets: [] },
    });
    await useStatsStore.getState().loadForUser(USER);
    expect(useStatsStore.getState().calibration.buckets).toHaveLength(1);
  });
});

describe('statsStore: coverage gap and the Log-screen nudge', () => {
  it('counts pending predictions, so a low log silences the nudge at once', async () => {
    // Eight high-confidence logs: enough history, low end untouched.
    for (let i = 0; i < 8; i++) {
      await insertPrediction(p({ id: `h${i}`, confidence: 90 }));
    }
    await useStatsStore.getState().recomputeForUser(USER);
    expect(useStatsStore.getState().coverageGap.low_end_empty).toBe(true);
    expect(coverageNudgeNow().show).toBe(true);

    // One prediction at 20%, still pending. The habit has changed today, not
    // whenever this happens to resolve.
    await insertPrediction(p({ id: 'low', confidence: 20 }));
    await useStatsStore.getState().recomputeForUser(USER);

    expect(useStatsStore.getState().coverageGap.low_end_empty).toBe(false);
    expect(coverageNudgeNow().show).toBe(false);
  });

  it('rebuilds the gap on loadForUser, not only on recompute', async () => {
    for (let i = 0; i < 8; i++) {
      await insertPrediction(p({ id: `h${i}`, confidence: 90 }));
    }
    await useStatsStore.getState().loadForUser(USER);

    expect(useStatsStore.getState().coverageGap.logged).toBe(8);
    expect(coverageNudgeNow().show).toBe(true);
  });

  it('respects the cooldown recorded in settings', async () => {
    for (let i = 0; i < 8; i++) {
      await insertPrediction(p({ id: `h${i}`, confidence: 90 }));
    }
    await useStatsStore.getState().recomputeForUser(USER);
    await useSettingsStore.getState().markCoverageNudgeShown();

    expect(coverageNudgeNow().show).toBe(false);
  });
});

describe('statsStore: per-category buckets (roadmap step 19)', () => {
  async function seedWorkAndHealth(): Promise<void> {
    await insertPrediction(p({ id: 'w1', category: 'work', confidence: 70 }));
    await insertPrediction(p({ id: 'w2', category: 'work', confidence: 75 }));
    await insertPrediction(p({ id: 'h1', category: 'health', confidence: 90 }));
    await resolvePrediction('w1', 'resolved_yes');
    await resolvePrediction('w2', 'resolved_no');
    await resolvePrediction('h1', 'resolved_yes');
  }

  it("finds a category's own bucket after a recompute", async () => {
    await seedWorkAndHealth();
    await useStatsStore.getState().recomputeForUser(USER);

    const { categoryBucketFor } = useStatsStore.getState();
    expect(categoryBucketFor('work', 65)).toMatchObject({
      low: 60,
      total_resolved: 2,
      resolved_yes: 1,
    });
    // Health has nothing in 60–80, and finance has nothing at all.
    expect(categoryBucketFor('health', 65)).toBeNull();
    expect(categoryBucketFor('finance', 65)).toBeNull();
  });

  it('rebuilds them on a fresh load, without a resolution', async () => {
    await seedWorkAndHealth();
    await useStatsStore.getState().recomputeForUser(USER);
    useStatsStore.setState({ categoryCalibration: {} });

    await useStatsStore.getState().loadForUser(USER);
    expect(useStatsStore.getState().categoryBucketFor('health', 95)).toMatchObject({
      low: 80,
      total_resolved: 1,
    });
  });
});

// Roadmap step 51: History filters by range without knowing the edges.
describe('confidenceRangeLow', () => {
  it('follows the fixed bucket convention, lower edge inclusive, top closed', () => {
    expect(confidenceRangeLow(0)).toBe(0);
    expect(confidenceRangeLow(19)).toBe(0);
    expect(confidenceRangeLow(20)).toBe(20);
    expect(confidenceRangeLow(65)).toBe(60);
    expect(confidenceRangeLow(80)).toBe(80);
    expect(confidenceRangeLow(100)).toBe(80);
  });
});

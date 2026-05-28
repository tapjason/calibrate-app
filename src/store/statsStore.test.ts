import { setDbForTests } from '@/db/client';
import { insertPrediction, resolvePrediction } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction } from '@/types';

import { useAuthStore } from './authStore';
import { useStatsStore } from './statsStore';

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
  });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
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

    const work = categoryStats.find((s) => s.category === 'work');
    expect(work?.predictions_made).toBe(2);
    expect(work?.predictions_resolved).toBe(2);
    // overconfident bucket: stated_mean=0.9 actual=0.5 → error=0.16 → 84
    expect(work?.calibration_score).toBeCloseTo(84, 1);

    const health = categoryStats.find((s) => s.category === 'health');
    expect(health?.predictions_made).toBe(1);
    expect(health?.predictions_resolved).toBe(0); // still pending
  });

  it('assigns badge levels according to the calibration table', async () => {
    // 25 resolved predictions in work, all confidence 100 + resolved_yes
    // → perfect calibration → score = 100 → expect 'sharp'
    // (oracle requires 100+ resolved)
    for (let i = 0; i < 25; i++) {
      await insertPrediction(
        p({ id: `w${i}`, category: 'work', confidence: 100 }),
      );
      await resolvePrediction(`w${i}`, 'resolved_yes');
    }
    await useStatsStore.getState().recomputeForUser(USER);

    const { categoryStats } = useStatsStore.getState();
    const work = categoryStats.find((s) => s.category === 'work');
    expect(work?.badge_level).toBe('sharp');
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

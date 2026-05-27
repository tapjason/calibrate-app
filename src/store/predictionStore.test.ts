import { setDbForTests } from '@/db/client';
import { insertPrediction } from '@/db/predictions';
import { getUserStat, listCategoryStats } from '@/db/stats';
import { createTestDb } from '@/db/testing';

import { useAuthStore } from './authStore';
import { usePredictionStore } from './predictionStore';
import { useStatsStore } from './statsStore';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  // Reset every Zustand singleton to a clean state.
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [] });
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

describe('predictionStore.create', () => {
  it('persists a prediction, with status=pending and integrity_bonus set by confidence', async () => {
    const p = await usePredictionStore.getState().create({
      title: '  Ship the prototype  ', // trimmed
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    expect(p.title).toBe('Ship the prototype');
    expect(p.status).toBe('pending');
    expect(p.integrity_bonus).toBe(true); // 50 is in [35, 65]

    // pending list reflects the new prediction
    expect(usePredictionStore.getState().pending).toHaveLength(1);
    expect(usePredictionStore.getState().pending[0].id).toBe(p.id);
  });

  it('sets integrity_bonus=false when confidence is outside [35, 65]', async () => {
    const p1 = await usePredictionStore.getState().create({
      title: 't1',
      category: 'work',
      confidence: 80,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    expect(p1.integrity_bonus).toBe(false);
  });

  it('rejects invalid confidence', async () => {
    const create = usePredictionStore.getState().create;
    await expect(
      create({
        title: 't',
        category: 'work',
        confidence: 150,
        due_date: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/confidence/);
    await expect(
      create({
        title: 't',
        category: 'work',
        confidence: 0.5, // not an integer
        due_date: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/confidence/);
  });

  it('rejects empty title', async () => {
    await expect(
      usePredictionStore.getState().create({
        title: '   ',
        category: 'work',
        confidence: 50,
        due_date: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/title/);
  });

  it('refuses to create when there is no active user', async () => {
    useAuthStore.getState().reset();
    await expect(
      usePredictionStore.getState().create({
        title: 't',
        category: 'work',
        confidence: 50,
        due_date: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/No active user/);
  });
});

describe('predictionStore.getById', () => {
  it('returns the prediction when it exists and belongs to the current user', async () => {
    const created = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 50,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    const got = await usePredictionStore.getState().getById(created.id);
    expect(got?.id).toBe(created.id);
    expect(got?.title).toBe('Ship it');
  });

  it('returns null for an unknown id', async () => {
    const got = await usePredictionStore.getState().getById('missing');
    expect(got).toBeNull();
  });

  it('returns null for a row that belongs to a different user (deep-link safety)', async () => {
    await insertPrediction({
      id: 'foreign',
      user_id: 'someone-else',
      title: 't',
      category: 'work',
      confidence: 50,
      created_at: '2026-01-01T00:00:00.000Z',
      due_date: '2026-06-01T00:00:00.000Z',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: true,
    });
    const got = await usePredictionStore.getState().getById('foreign');
    expect(got).toBeNull();
  });
});

describe('predictionStore.resolve (L4 gate)', () => {
  it('moves a prediction from pending to resolved and persists fresh stats', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Ship the prototype',
      category: 'work',
      confidence: 80,
      due_date: '2026-06-01T00:00:00.000Z',
    });

    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');

    // In-store lists reflect the move
    expect(usePredictionStore.getState().pending).toHaveLength(0);
    expect(usePredictionStore.getState().resolved).toHaveLength(1);

    // Stats persisted in the DB
    const userId = useAuthStore.getState().userId!;
    const userStat = await getUserStat(userId);
    expect(userStat).not.toBeNull();
    expect(userStat?.total_predictions).toBe(1);
    expect(userStat?.total_resolved).toBe(1);

    const cats = await listCategoryStats(userId);
    expect(cats).toHaveLength(1);
    expect(cats[0].category).toBe('work');
    expect(cats[0].predictions_resolved).toBe(1);
    expect(cats[0].calibration_score).toBeGreaterThanOrEqual(0);
  });

  it('updates calibration_rating across multiple resolutions', async () => {
    const create = (overrides: { confidence: number }) =>
      usePredictionStore.getState().create({
        title: 't',
        category: 'work',
        confidence: overrides.confidence,
        due_date: '2026-06-01T00:00:00.000Z',
      });

    // 10 predictions at confidence 90, 5 resolved yes → overconfident bucket
    const created = await Promise.all(
      Array.from({ length: 10 }, () => create({ confidence: 90 })),
    );
    for (let i = 0; i < created.length; i++) {
      await usePredictionStore
        .getState()
        .resolve(created[i].id, i < 5 ? 'resolved_yes' : 'resolved_no');
    }

    const userId = useAuthStore.getState().userId!;
    const userStat = await getUserStat(userId);
    // Calibration math (verified independently in calibration.test.ts):
    //   stated_mean=0.9, actual_rate=0.5, error=0.16 → rating=84
    expect(userStat?.calibration_rating).toBeCloseTo(84, 1);
    expect(userStat?.total_resolved).toBe(10);
  });

  it('rolls back the resolution if stats recompute throws', async () => {
    const p = await usePredictionStore.getState().create({
      title: 't',
      category: 'work',
      confidence: 80,
      due_date: '2026-06-01T00:00:00.000Z',
    });

    // Force statsStore.recomputeForUser to throw mid-transaction.
    const original = useStatsStore.getState().recomputeForUser;
    useStatsStore.setState({
      recomputeForUser: async () => {
        throw new Error('forced failure');
      },
    });

    await expect(
      usePredictionStore.getState().resolve(p.id, 'resolved_yes'),
    ).rejects.toThrow(/forced failure/);

    // Restore so afterEach cleanup is clean
    useStatsStore.setState({ recomputeForUser: original });

    // The DB-level resolution must have rolled back: still pending.
    await usePredictionStore.getState().loadPending();
    await usePredictionStore.getState().loadResolved();
    expect(usePredictionStore.getState().pending).toHaveLength(1);
    expect(usePredictionStore.getState().resolved).toHaveLength(0);
  });
});

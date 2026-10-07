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
  usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null });
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
    //   stated_mean=0.9, actual_rate=0.5, |0.9−0.5| = 0.40 → rating=60
    expect(userStat?.calibration_rating).toBeCloseTo(60, 1);
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

describe('predictionStore.reflect', () => {
  const create = () =>
    usePredictionStore.getState().create({
      title: 'Ship the prototype',
      category: 'work',
      confidence: 80,
      due_date: '2026-06-01T00:00:00.000Z',
    });

  it('attaches a reflection to a resolved prediction, trimmed', async () => {
    const p = await create();
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    await usePredictionStore.getState().reflect(p.id, '  slipped a week  ');
    expect(usePredictionStore.getState().resolved[0].reflection).toBe('slipped a week');
  });

  it('clears the reflection when given blank text', async () => {
    const p = await create();
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes', 'first');
    await usePredictionStore.getState().reflect(p.id, '   ');
    expect(usePredictionStore.getState().resolved[0].reflection).toBeNull();
  });

  it('never attaches to a prediction that has not been answered', async () => {
    const p = await create();
    await usePredictionStore.getState().reflect(p.id, 'too early');
    const fresh = await usePredictionStore.getState().getById(p.id);
    expect(fresh?.reflection).toBeNull();
  });
});

describe('statsStore.bucketFor', () => {
  it('finds the bucket a confidence falls in, after a resolve', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'A',
      category: 'work',
      confidence: 60,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect(useStatsStore.getState().bucketFor(75)?.low).toBe(60);
    expect(useStatsStore.getState().bucketFor(20)).toBeNull();
  });
});

describe('predictionStore.reopen', () => {
  it('undoes a resolution: back to pending, and stats forget it', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 70,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_no', 'oops');
    expect(useStatsStore.getState().userStat?.total_resolved).toBe(1);

    await usePredictionStore.getState().reopen(p.id);

    const back = await usePredictionStore.getState().getById(p.id);
    expect(back?.status).toBe('pending');
    expect(back?.resolved_at).toBeNull();
    expect(back?.reflection).toBeNull();
    expect(usePredictionStore.getState().pending).toHaveLength(1);
    expect(useStatsStore.getState().userStat?.total_resolved).toBe(0);
  });

  it('does nothing to a prediction that was never answered', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 70,
      due_date: '2026-06-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().reopen(p.id);
    expect((await usePredictionStore.getState().getById(p.id))?.status).toBe('pending');
  });
});

describe('predictionStore.loadDemoData', () => {
  it('adds the demo predictions once, with stats unlocked', async () => {
    expect(await usePredictionStore.getState().loadDemoData()).toBe(true);
    const { pending, resolved } = usePredictionStore.getState();
    expect(resolved.length).toBeGreaterThanOrEqual(60);
    expect(pending.length).toBeGreaterThan(0);

    const userId = useAuthStore.getState().userId!;
    expect((await getUserStat(userId))?.rating_is_provisional).toBe(false);
    const health = (await listCategoryStats(userId)).find((c) => c.category === 'health');
    expect(health?.badge_level).toBe('sharp');

    // A second tap changes nothing.
    expect(await usePredictionStore.getState().loadDemoData()).toBe(false);
    expect(usePredictionStore.getState().resolved).toHaveLength(resolved.length);
  });
});

// Roadmap D2 and D17: a day counts with one logged or answered, and the
// stored streak and Home's line agree.
describe('predictionStore.streakNow', () => {
  const log = (title: string) =>
    usePredictionStore.getState().create({
      title,
      category: 'work',
      confidence: 60,
      due_date: '2099-06-01T12:00:00.000Z',
    });

  it('counts today with its first log, and the stored streak follows', async () => {
    expect(usePredictionStore.getState().streakNow()).toMatchObject({
      streak: 0,
      today: 0,
      todayCounts: false,
    });

    await log('one');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({
      streak: 1,
      today: 1,
      todayCounts: true,
    });
    expect(useStatsStore.getState().userStat?.current_streak).toBe(1);

    // The day's goal is three; the streak doesn't wait for it.
    await log('two');
    await log('three');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 1, today: 3 });
  });

  it('counts an answer as well as a log', async () => {
    const a = await log('one');
    await log('two');
    await usePredictionStore.getState().resolve(a.id, 'resolved_no');
    expect(usePredictionStore.getState().streakNow().today).toBe(3);
  });

  /**
   * Local noon `back` calendar days ago. Subtracting 24h steps from now could
   * skip or merge a local day near midnight or across a DST change.
   */
  const daysAgo = (back: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };

  /** Three logged on each of the six days before today (the goal, not just the minimum). */
  const sixCountedDays = async (userId: string) => {
    for (let back = 6; back >= 1; back -= 1) {
      for (let i = 0; i < 3; i += 1) {
        await insertPrediction({
          id: `d${back}-${i}`,
          user_id: userId,
          title: `day ${back} #${i}`,
          category: 'work',
          confidence: 60,
          created_at: daysAgo(back),
          due_date: '2099-06-01T12:00:00.000Z',
          status: 'pending',
          resolved_at: null,
          reflection: null,
          integrity_bonus: true,
        });
      }
    }
  };

  // Decided 2026-10-06: checkpoints at 7, 30, 100 and 365 days.
  it('holds the checkpoint an answer reached until Resolve shows it, and a withdrawn answer takes it back', async () => {
    const userId = useAuthStore.getState().userId!;
    await sixCountedDays(userId);
    await usePredictionStore.getState().loadPending();
    expect(usePredictionStore.getState().streakNow()).toMatchObject({
      streak: 6,
      checkpoint: null,
      nextCheckpoint: 7,
    });

    // Today's first answer is day seven (one a day since D17).
    await usePredictionStore.getState().resolve('d6-0', 'resolved_yes');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
    expect(usePredictionStore.getState().streakCheckpoint).toBe(7);

    await usePredictionStore.getState().reopen('d6-0');
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();

    // Answered again, then a second: only the first earned it.
    await usePredictionStore.getState().resolve('d6-0', 'resolved_yes');
    usePredictionStore.getState().clearStreakCheckpoint();
    await usePredictionStore.getState().resolve('d6-1', 'resolved_no');
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  // A sync writes rows to the database without the lists here seeing them.
  it("doesn't credit an answer with a checkpoint that rows written behind its back reached", async () => {
    const userId = useAuthStore.getState().userId!;
    await sixCountedDays(userId);
    await usePredictionStore.getState().loadPending();
    // Today's three arrive from another device: day seven, checkpoint and all.
    for (let i = 0; i < 3; i += 1) {
      await insertPrediction({
        id: `synced-${i}`,
        user_id: userId,
        title: `synced #${i}`,
        category: 'work',
        confidence: 60,
        created_at: new Date().toISOString(),
        due_date: '2099-06-01T12:00:00.000Z',
        status: 'pending',
        resolved_at: null,
        reflection: null,
        integrity_bonus: true,
      });
    }
    expect(usePredictionStore.getState().streakNow().checkpoint).toBeNull();

    await usePredictionStore.getState().resolve('d6-0', 'resolved_yes');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });
});

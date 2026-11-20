import { wipeLocalUserData } from '@/db/account';
import { getDb, setDbForTests, withTransaction } from '@/db/client';
import * as predictionsDb from '@/db/predictions';
import {
  countRefiles,
  getPrediction,
  insertPrediction,
  listCategoryOrigins,
  listDeletions,
  listDirtyPredictions,
  listPendingPredictions,
  listPendingTombstonesSettled,
  markPredictionSynced,
  reconcileTombstoneWithRemote,
  tombstoneCovers,
  upsertPredictionFromRemote,
} from '@/db/predictions';
import { getUserStat, listCategoryStats } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { __setTimeZoneForTests } from '@/engine/localTime';
import { supportAsideKey } from '@/engine/supportAside';
import type { Prediction } from '@/types';

import { useAuthStore } from './authStore';
import {
  answerNowIsSameDay,
  canRenumber,
  categoryChangeCountedIfAnswered,
  categoryChangeIsCounted,
  moveIsCounted,
  openRepeatOf,
  openTwinFor,
  rewordedLater,
  skipAnswerBy,
  usePredictionStore,
} from './predictionStore';
import {
  __heldChangesForTests,
  __setPersistenceForTests,
  useSettingsStore,
  type StoredSettings,
} from './settingsStore';
import { useStatsStore } from './statsStore';
import { loggedEarlier } from '../../jest/loggedEarlier';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  // Reset every Zustand singleton to a clean state.
  useAuthStore.getState().reset();
  usePredictionStore.setState({
    pending: [],
    resolved: [],
    deletedCount: 0,
    postponedCount: 0,
    refiledCount: 0,
    categoryOrigins: {},
    streakCheckpoint: null,
    streakCheckpointFrom: null,
    justSavedId: null,
  });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
    stale: false,
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
    // For Today to scroll to, once the sheet closes (roadmap D48).
    expect(usePredictionStore.getState().justSavedId).toBe(p.id);
    usePredictionStore.getState().clearJustSaved();
    expect(usePredictionStore.getState().justSavedId).toBeNull();
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
    const p = await loggedEarlier(() => usePredictionStore.getState().create({
      title: 'Ship the prototype',
      category: 'work',
      confidence: 80,
      due_date: '2026-06-01T00:00:00.000Z',
    }));

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
      loggedEarlier(() => usePredictionStore.getState().create({
        title: 't',
        category: 'work',
        confidence: overrides.confidence,
        due_date: '2026-06-01T00:00:00.000Z',
      }));

    // 10 predictions at confidence 90, 5 answered yes → overconfident bucket
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
    const p = await loggedEarlier(() => usePredictionStore.getState().create({
      title: 'A',
      category: 'work',
      confidence: 60,
      due_date: '2026-06-01T00:00:00.000Z',
    }));
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect(useStatsStore.getState().bucketFor(75)?.low).toBe(60);
    expect(useStatsStore.getState().bucketFor(20)).toBeNull();
  });
});

// Roadmap D45, owner 2026-11-09: there is no reopen. A Yes or No switches in
// place (correct), and a Can't tell is answered through resolve.
it('has no way to put an answer back to open', () => {
  expect('reopen' in usePredictionStore.getState()).toBe(false);
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
  it('holds the checkpoint an answer reached until Resolve shows it, earned once', async () => {
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
    // An answer's, which is Resolve's to show (step 194).
    expect(usePredictionStore.getState().streakCheckpointFrom).toBe('answer');

    // A second answer the same day: only the first earned it.
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

  // Step 194 (FUTURE_UI B1): a log reaches a checkpoint as well as an answer,
  // and Log closes onto Today, which plays it.
  it('holds the checkpoint a log reached for Today, earned once', async () => {
    const userId = useAuthStore.getState().userId!;
    await sixCountedDays(userId);
    await usePredictionStore.getState().loadPending();

    // Today's first log is day seven.
    const first = await log('day seven');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
    expect(usePredictionStore.getState()).toMatchObject({
      streakCheckpoint: 7,
      streakCheckpointFrom: 'log',
      justSavedId: first.id,
    });

    // A second log the same day: only the first earned it.
    usePredictionStore.getState().clearStreakCheckpoint();
    expect(usePredictionStore.getState().streakCheckpointFrom).toBeNull();
    await log('another');
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
    expect(usePredictionStore.getState().streakCheckpointFrom).toBeNull();
  });

  it('keeps a log’s checkpoint through the next log, for "Save and log another"', async () => {
    await sixCountedDays(useAuthStore.getState().userId!);
    await usePredictionStore.getState().loadPending();
    await log('day seven');
    await log('and one more');
    expect(usePredictionStore.getState()).toMatchObject({
      streakCheckpoint: 7,
      streakCheckpointFrom: 'log',
    });
  });

  it('sets nothing for a log on a day that is no checkpoint', async () => {
    const userId = useAuthStore.getState().userId!;
    await sixCountedDays(userId);
    // Five counted days before today, so today's log makes six.
    for (let i = 0; i < 3; i += 1) await usePredictionStore.getState().remove(`d6-${i}`);
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 5, checkpoint: null });

    await log('day six');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 6, checkpoint: null });
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  it("doesn't credit a log with a checkpoint that rows written behind its back reached", async () => {
    const userId = useAuthStore.getState().userId!;
    await sixCountedDays(userId);
    await usePredictionStore.getState().loadPending();
    // Today's first arrives from another device: day seven, checkpoint and all.
    await insertPrediction({
      id: 'synced-today',
      user_id: userId,
      title: 'synced',
      category: 'work',
      confidence: 60,
      created_at: new Date().toISOString(),
      due_date: '2099-06-01T12:00:00.000Z',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: true,
    });
    expect(usePredictionStore.getState().streakNow().checkpoint).toBeNull();

    await log('logged here');
    expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  // Code review 2026-11-18: step 194 put the reads before the insert, and a
  // read that threw lost the person's prediction.
  describe('when a read around a save or an answer fails', () => {
    let warn: jest.SpyInstance;
    const real = () => ({
      loadPending: usePredictionStore.getState().loadPending,
      loadResolved: usePredictionStore.getState().loadResolved,
    });
    let restore: ReturnType<typeof real>;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      restore = real();
    });

    afterEach(() => {
      usePredictionStore.setState(restore);
      warn.mockRestore();
    });

    it('still saves the prediction, and claims no checkpoint', async () => {
      const userId = useAuthStore.getState().userId!;
      const failing = async () => {
        throw new Error('read failed');
      };
      usePredictionStore.setState({ loadPending: failing, loadResolved: failing });

      const saved = await log('saved anyway');

      expect(saved.title).toBe('saved anyway');
      const stored = await listPendingPredictions(userId);
      expect(stored.map((p) => p.id)).toEqual([saved.id]);
      expect(useStatsStore.getState().userStat?.total_predictions).toBe(1);
      expect(usePredictionStore.getState()).toMatchObject({
        justSavedId: saved.id,
        streakCheckpoint: null,
        streakCheckpointFrom: null,
      });
      expect(warn).toHaveBeenCalledWith(
        '[predictions] a list reload around a save failed:',
        expect.any(Error),
      );
    });

    // The lists held here missed a sync's rows; the reload after the save
    // sees them. Comparing the two would credit this log with the checkpoint
    // those rows reached.
    it("doesn't credit the log with a checkpoint when the read before it failed", async () => {
      const userId = useAuthStore.getState().userId!;
      await sixCountedDays(userId);
      await insertPrediction({
        id: 'synced-today',
        user_id: userId,
        title: 'synced',
        category: 'work',
        confidence: 60,
        created_at: new Date().toISOString(),
        due_date: '2099-06-01T12:00:00.000Z',
        status: 'pending',
        resolved_at: null,
        reflection: null,
        integrity_bonus: true,
      });
      // Nothing loaded here yet: the lists held are empty.
      expect(usePredictionStore.getState().pending).toEqual([]);
      let calls = 0;
      usePredictionStore.setState({
        loadPending: async () => {
          calls += 1;
          if (calls === 1) throw new Error('read failed');
          await restore.loadPending();
        },
      });

      const saved = await log('logged here');

      // The reload after the save worked, and the streak is at its checkpoint…
      expect(usePredictionStore.getState().pending.map((p) => p.id)).toContain(saved.id);
      expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
      // …which the synced row reached, not this log.
      expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
    });

    // Code review 2026-11-18, the same for an answer: the reads around it
    // must never stop it being recorded, or claim what they didn't see.
    describe('answering', () => {
      const failing = async () => {
        throw new Error('read failed');
      };
      let realGetById: ReturnType<typeof usePredictionStore.getState>['getById'];
      beforeEach(() => {
        realGetById = usePredictionStore.getState().getById;
      });
      afterEach(() => {
        usePredictionStore.setState({ getById: realGetById });
      });

      const statusOf = async (id: string) => (await getPrediction(id))?.status;

      // The reminder's Happened / Didn't calls resolve with no options.
      it("records a reminder's answer once when every read around it fails, and claims nothing", async () => {
        const p = await loggedEarlier(() => log('answered from the lock screen'));
        usePredictionStore.setState({ loadPending: failing, loadResolved: failing });

        await expect(usePredictionStore.getState().resolve(p.id, 'resolved_yes')).resolves.toBeUndefined();
        expect(await statusOf(p.id)).toBe('resolved_yes');
        // A second answer is a no-op: it was recorded once.
        await usePredictionStore.getState().resolve(p.id, 'resolved_no');
        expect(await statusOf(p.id)).toBe('resolved_yes');

        // The stats moved with it, inside its transaction…
        expect((await getUserStat(p.user_id))?.total_resolved).toBe(1);
        // …and nothing else is claimed.
        expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
        expect(useStatsStore.getState().milestone).toBeNull();
        expect(useStatsStore.getState().tierDrop).toBeNull();
      });

      it("doesn't credit the answer with a checkpoint when the read before it failed", async () => {
        const userId = useAuthStore.getState().userId!;
        await sixCountedDays(userId);
        await usePredictionStore.getState().loadPending();
        // Today's first arrives from another device after the lists loaded.
        await insertPrediction({
          id: 'synced-today',
          user_id: userId,
          title: 'synced',
          category: 'work',
          confidence: 60,
          created_at: new Date().toISOString(),
          due_date: '2099-06-01T12:00:00.000Z',
          status: 'pending',
          resolved_at: null,
          reflection: null,
          integrity_bonus: true,
        });
        let calls = 0;
        usePredictionStore.setState({
          loadPending: async () => {
            calls += 1;
            if (calls === 1) throw new Error('read failed');
            await restore.loadPending();
          },
        });

        await usePredictionStore.getState().resolve('d6-0', 'resolved_yes');

        expect(await statusOf('d6-0')).toBe('resolved_yes');
        expect(usePredictionStore.getState().streakNow()).toMatchObject({ streak: 7, checkpoint: 7 });
        // The synced row reached it, not this answer.
        expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
      });

      it("doesn't reject or claim a checkpoint when the reload after the answer fails", async () => {
        const userId = useAuthStore.getState().userId!;
        await sixCountedDays(userId);
        let calls = 0;
        usePredictionStore.setState({
          loadResolved: async () => {
            calls += 1;
            if (calls > 1) throw new Error('read failed');
            await restore.loadResolved();
          },
        });

        await expect(
          usePredictionStore.getState().resolve('d6-0', 'resolved_no'),
        ).resolves.toBeUndefined();

        expect(await statusOf('d6-0')).toBe('resolved_no');
        expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
      });

      /** A "Can't tell" given `back` days ago on a prediction due then. */
      const skipped = async (id: string, back: number) => {
        const userId = useAuthStore.getState().userId!;
        await insertPrediction({
          id,
          user_id: userId,
          title: 'Hard to say',
          category: 'work',
          confidence: 60,
          created_at: daysAgo(back + 2),
          due_date: daysAgo(back),
          status: 'skipped',
          resolved_at: daysAgo(back),
          reflection: null,
          integrity_bonus: true,
        });
      };

      it("answers a Can't tell inside its week from the copy held here when its read fails", async () => {
        await skipped('skip-1', 1);
        await usePredictionStore.getState().loadResolved();
        usePredictionStore.setState({ getById: failing });

        await usePredictionStore
          .getState()
          .resolve('skip-1', 'resolved_yes', undefined, { answeringSkip: true });

        expect(await statusOf('skip-1')).toBe('resolved_yes');
        expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
      });

      it("keeps a Can't tell past its week closed on the copy held here", async () => {
        await skipped('skip-old', 20);
        await usePredictionStore.getState().loadResolved();
        usePredictionStore.setState({ getById: failing });

        await expect(
          usePredictionStore
            .getState()
            .resolve('skip-old', 'resolved_yes', undefined, { answeringSkip: true }),
        ).rejects.toThrow(/more than a week past its due day/);
        expect(await statusOf('skip-old')).toBe('skipped');
      });

      // The recompute sets the stats in memory before the commit: a commit
      // that then fails must leave no milestone and no rating ahead of the
      // database, or the next "moved from…" line would start from it.
      it('claims nothing, and holds the stats as stored, when the answer fails to commit', async () => {
        const userId = useAuthStore.getState().userId!;
        // Nineteen scored answers: the twentieth unlocks the rating.
        for (let i = 0; i < 19; i += 1) {
          await insertPrediction({
            id: `a${i}`,
            user_id: userId,
            title: `answered #${i}`,
            category: 'work',
            confidence: 70,
            created_at: daysAgo(3),
            due_date: daysAgo(1),
            status: i % 10 < 7 ? 'resolved_yes' : 'resolved_no',
            resolved_at: daysAgo(1),
            reflection: null,
            integrity_bonus: false,
          });
        }
        await insertPrediction({
          id: 'twentieth',
          user_id: userId,
          title: 'the twentieth',
          category: 'work',
          confidence: 70,
          created_at: daysAgo(3),
          due_date: daysAgo(1),
          status: 'pending',
          resolved_at: null,
          reflection: null,
          integrity_bonus: false,
        });
        await useStatsStore.getState().recomputeForUser(userId);
        useStatsStore.getState().clearMilestone();
        expect(useStatsStore.getState().userStat).toMatchObject({
          total_resolved: 19,
          rating_is_provisional: true,
        });

        // The first transaction runs its body, then fails to commit.
        const db = getDb();
        const realTransaction = db.transaction.bind(db);
        let calls = 0;
        db.transaction = async <T,>(fn: () => Promise<T>) => {
          calls += 1;
          if (calls > 1) return realTransaction(fn);
          return realTransaction(async () => {
            await fn();
            throw new Error('commit failed');
          });
        };

        try {
          await expect(
            usePredictionStore.getState().resolve('twentieth', 'resolved_yes'),
          ).rejects.toThrow('commit failed');
        } finally {
          db.transaction = realTransaction;
        }

        expect(await statusOf('twentieth')).toBe('pending');
        expect(useStatsStore.getState().milestone).toBeNull();
        expect(useStatsStore.getState().tierDrop).toBeNull();
        expect(useStatsStore.getState().userStat).toMatchObject({
          total_resolved: 19,
          rating_is_provisional: true,
        });

        // Answered again once the database works, the unlock is this answer's.
        await usePredictionStore.getState().resolve('twentieth', 'resolved_yes');
        expect(await statusOf('twentieth')).toBe('resolved_yes');
        expect(useStatsStore.getState().milestone).toMatchObject({ kind: 'rating_unlocked' });
      });

      // Review round 5: the commit fails AND reading the stats again fails.
      // Memory held the rolled-back answer's numbers, and the retry, comparing
      // against them, lost the unlock moment.
      it('puts the stats back and marks them stale when the reload after a failed commit fails too', async () => {
        const userId = useAuthStore.getState().userId!;
        for (let i = 0; i < 19; i += 1) {
          await insertPrediction({
            id: `a${i}`,
            user_id: userId,
            title: `answered #${i}`,
            category: 'work',
            confidence: 70,
            created_at: daysAgo(3),
            due_date: daysAgo(1),
            status: i % 10 < 7 ? 'resolved_yes' : 'resolved_no',
            resolved_at: daysAgo(1),
            reflection: null,
            integrity_bonus: false,
          });
        }
        await insertPrediction({
          id: 'twentieth',
          user_id: userId,
          title: 'the twentieth',
          category: 'work',
          confidence: 70,
          created_at: daysAgo(3),
          due_date: daysAgo(1),
          status: 'pending',
          resolved_at: null,
          reflection: null,
          integrity_bonus: false,
        });
        await useStatsStore.getState().recomputeForUser(userId);
        useStatsStore.getState().clearMilestone();

        // The answer's transaction runs its body and fails to commit; the
        // reload's transaction fails outright.
        const db = getDb();
        const realTransaction = db.transaction.bind(db);
        let calls = 0;
        db.transaction = async <T,>(fn: () => Promise<T>) => {
          calls += 1;
          if (calls === 1) {
            return realTransaction(async () => {
              await fn();
              throw new Error('commit failed');
            });
          }
          if (calls === 2) throw new Error('reload failed');
          return realTransaction(fn);
        };

        try {
          await expect(
            usePredictionStore.getState().resolve('twentieth', 'resolved_yes'),
          ).rejects.toThrow('commit failed');
        } finally {
          db.transaction = realTransaction;
        }

        expect(await statusOf('twentieth')).toBe('pending');
        // Nothing of the rolled-back answer stays on screen or is claimed.
        expect(useStatsStore.getState()).toMatchObject({
          stale: true,
          milestone: null,
          tierDrop: null,
          userStat: { total_resolved: 19, rating_is_provisional: true },
        });
        expect(warn).toHaveBeenCalledWith(
          '[predictions] reloading the stats after a failed write failed:',
          expect.any(Error),
        );

        // Answered again once the database works: the unlock is this
        // answer's, read against what the database stored, and the stats are
        // fresh again.
        await usePredictionStore.getState().resolve('twentieth', 'resolved_yes');
        expect(await statusOf('twentieth')).toBe('resolved_yes');
        expect(useStatsStore.getState().milestone).toMatchObject({ kind: 'rating_unlocked' });
        expect(useStatsStore.getState().stale).toBe(false);
      });

      it("writes nothing when a Can't tell's read fails and no copy is held", async () => {
        await skipped('skip-1', 1);
        usePredictionStore.setState({ getById: failing });

        await expect(
          usePredictionStore
            .getState()
            .resolve('skip-1', 'resolved_yes', undefined, { answeringSkip: true }),
        ).rejects.toThrow('read failed');
        expect(await statusOf('skip-1')).toBe('skipped');
      });
    });

    it('reports the save as done when only the reload after it fails', async () => {
      const userId = useAuthStore.getState().userId!;
      await sixCountedDays(userId);
      let calls = 0;
      usePredictionStore.setState({
        loadPending: async () => {
          calls += 1;
          if (calls > 1) throw new Error('read failed');
          await restore.loadPending();
        },
      });

      const saved = await log('day seven');

      expect((await listPendingPredictions(userId)).map((p) => p.id)).toContain(saved.id);
      expect(usePredictionStore.getState().justSavedId).toBe(saved.id);
      // Without the reload there is no fresh side to compare: no claim.
      expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
    });
  });
});

// Roadmap D25: an open prediction can be edited (never its confidence) and
// deleted, with stats following in the same transaction.
describe('predictionStore.update and remove', () => {
  // Far enough ahead that the D41 floor (tomorrow) never moves them.
  const create = (category: 'work' | 'health' = 'work') =>
    usePredictionStore.getState().create({
      title: 'Ship it',
      category,
      confidence: 70,
      due_date: '2099-06-01T12:00:00.000Z',
    });

  // Blind playtest 2026-11-04: a date typed into the web field got past its
  // min, so a prediction could be due today (or in 1906) and answered at once.
  it('never saves a due date before tomorrow, on create or edit', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = (iso: string) =>
      new Date(iso).toDateString() === tomorrow.toDateString();

    const p = await usePredictionStore.getState().create({
      title: 'Typed today',
      category: 'work',
      confidence: 70,
      due_date: new Date().toISOString(),
    });
    expect(isTomorrow(p.due_date)).toBe(true);

    await usePredictionStore.getState().update(p.id, {
      title: 'Typed today',
      category: 'work',
      due_date: '1906-11-05T12:00:00.000Z',
    });
    const [after] = usePredictionStore.getState().pending;
    expect(isTomorrow(after.due_date)).toBe(true);
  });

  it('changes title, category and due date, and moves the category counts', async () => {
    const p = await create('work');
    await usePredictionStore.getState().update(p.id, {
      title: '  Ship the beta  ',
      category: 'health',
      due_date: '2099-06-08T12:00:00.000Z',
    });
    const [after] = usePredictionStore.getState().pending;
    expect(after).toMatchObject({
      id: p.id,
      title: 'Ship the beta',
      category: 'health',
      due_date: '2099-06-08T12:00:00.000Z',
      confidence: 70,
    });
    const stats = await listCategoryStats(after.user_id);
    expect(stats.find((c) => c.category === 'health')?.predictions_made).toBe(1);
    expect(stats.find((c) => c.category === 'work')?.predictions_made ?? 0).toBe(0);
  });

  it('refuses an empty title', async () => {
    const p = await create();
    await expect(
      usePredictionStore.getState().update(p.id, {
        title: '   ',
        category: 'work',
        due_date: p.due_date,
      }),
    ).rejects.toThrow('title is required');
  });

  it('leaves an answered prediction as it was', async () => {
    const p = await create();
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    await usePredictionStore.getState().update(p.id, {
      title: 'Changed',
      category: 'health',
      due_date: p.due_date,
    });
    const [resolved] = usePredictionStore.getState().resolved;
    expect(resolved.title).toBe('Ship it');
    expect(resolved.category).toBe('work');
  });

  it('deletes one, from the lists and the counts', async () => {
    const p = await create();
    await usePredictionStore.getState().remove(p.id);
    expect(usePredictionStore.getState().pending).toHaveLength(0);
    const stat = await getUserStat(p.user_id);
    expect(stat?.total_predictions).toBe(0);
  });

  // Code review 2026-11-18: deletePrediction deletes by id, so remove must
  // only reach it for this user's own row.
  it("leaves another account's prediction, and a missing one, alone", async () => {
    await insertPrediction({
      id: 'foreign',
      user_id: 'someone-else',
      title: 'Theirs',
      category: 'work',
      confidence: 50,
      created_at: '2026-01-01T00:00:00.000Z',
      due_date: '2099-06-01T12:00:00.000Z',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: true,
    });

    await usePredictionStore.getState().remove('foreign');
    await usePredictionStore.getState().remove('missing');

    expect(await getPrediction('foreign')).toMatchObject({ id: 'foreign', user_id: 'someone-else' });
    expect(await listDeletions('someone-else')).toEqual([]);
    expect(await listDeletions(useAuthStore.getState().userId!)).toEqual([]);
  });
});

// Roadmap D45 (decided 2026-11-06): the three score holes from the November
// blind playtests.
describe('the score holes (roadmap D45)', () => {
  const DAY = 86_400_000;

  it('dates new words, so an answer the same day is not scored', async () => {
    // Logged yesterday, due today: an answer today would normally count.
    const p = await loggedEarlier(() =>
      usePredictionStore.getState().create({
        title: 'The Fed holds rates',
        category: 'finance',
        confidence: 70,
        due_date: new Date(Date.now() + DAY).toISOString(),
      }),
    );
    await usePredictionStore.getState().update(p.id, {
      title: 'The Fed does NOT hold rates',
      category: 'finance',
      due_date: new Date().toISOString(),
    });
    const after = await usePredictionStore.getState().getById(p.id);
    expect(after?.title_edited_at).toBeTruthy();
    // created_at stays, for the streak.
    expect(after?.created_at).toBe(p.created_at);
    // Held to tomorrow at the earliest, like a prediction logged today.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(new Date(after!.due_date).toDateString()).toBe(tomorrow.toDateString());

    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect((await getUserStat(p.user_id))?.total_resolved).toBe(0);
  });

  it("doesn't date a fixed case, spacing or full stop", async () => {
    const p = await usePredictionStore.getState().create({
      title: 'ship it',
      category: 'work',
      confidence: 70,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().update(p.id, {
      title: 'Ship  it.',
      category: 'work',
      due_date: p.due_date,
    });
    const after = await usePredictionStore.getState().getById(p.id);
    expect(after?.title).toBe('Ship  it.');
    expect(after?.title_edited_at).toBeUndefined();
  });

  it('counts a deleted scored answer and a deleted due one, not an early delete', async () => {
    const answered = await loggedEarlier(() =>
      usePredictionStore.getState().create({
        title: 'A miss',
        category: 'work',
        confidence: 85,
        due_date: new Date(Date.now() + DAY).toISOString(),
      }),
    );
    await usePredictionStore.getState().resolve(answered.id, 'resolved_no');
    const due = await loggedEarlier(
      () =>
        usePredictionStore.getState().create({
          title: 'About to miss',
          category: 'work',
          confidence: 85,
          due_date: new Date(Date.now() - DAY).toISOString(),
        }),
      3,
    );
    const early = await usePredictionStore.getState().create({
      title: 'A typo',
      category: 'work',
      confidence: 50,
      due_date: '2099-06-01T12:00:00.000Z',
    });

    await usePredictionStore.getState().remove(answered.id);
    await usePredictionStore.getState().remove(due.id);
    await usePredictionStore.getState().remove(early.id);
    expect(usePredictionStore.getState().deletedCount).toBe(2);
  });
});

// Roadmap D34: an answer can be corrected, re-filed or deleted for 24 hours,
// and never turned into "Can't tell".
describe('predictionStore.correct, refile and remove within the window', () => {
  const answer = async (outcome: 'resolved_yes' | 'resolved_no' = 'resolved_no') => {
    const p = await loggedEarlier(() => usePredictionStore.getState().create({
      title: 'Ship it',
      category: 'work',
      confidence: 70,
      due_date: '2026-06-01T12:00:00.000Z',
    }));
    await usePredictionStore.getState().resolve(p.id, outcome);
    return usePredictionStore.getState().resolved.find((r) => r.id === p.id)!;
  };
  /** An answer given two days ago: past the window. */
  const oldAnswer = async () => {
    const userId = useAuthStore.getState().userId!;
    const at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await insertPrediction({
      id: 'old-1',
      user_id: userId,
      title: 'Old one',
      category: 'work',
      confidence: 70,
      created_at: at,
      due_date: at,
      status: 'resolved_no',
      resolved_at: at,
      reflection: null,
      integrity_bonus: false,
    });
    await usePredictionStore.getState().loadResolved();
    return 'old-1';
  };

  // Code review 2026-11-18: "Change answer" never depends on a read either.
  describe('when a read around the switch fails', () => {
    const failing = async () => {
      throw new Error('read failed');
    };
    let real: Pick<ReturnType<typeof usePredictionStore.getState>, 'getById' | 'loadResolved'>;
    let warn: jest.SpyInstance;
    beforeEach(() => {
      const s = usePredictionStore.getState();
      real = { getById: s.getById, loadResolved: s.loadResolved };
      warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
      usePredictionStore.setState(real);
      warn.mockRestore();
    });

    it('switches it once, from the copy held here, without rejecting or claiming', async () => {
      const p = await answer('resolved_no');
      usePredictionStore.setState({ getById: failing, loadResolved: failing });

      await expect(usePredictionStore.getState().correct(p.id, 'resolved_yes')).resolves.toBeUndefined();
      expect((await getPrediction(p.id))?.status).toBe('resolved_yes');
      // The same switch again changes nothing.
      await usePredictionStore.getState().correct(p.id, 'resolved_yes');
      const after = await getPrediction(p.id);
      expect(after?.status).toBe('resolved_yes');
      expect(after?.resolved_at).toBe(p.resolved_at);
      // The stats followed it inside its transaction; nothing is claimed.
      expect(useStatsStore.getState().calibration.buckets[0]?.resolved_yes).toBe(1);
      expect(useStatsStore.getState().milestone).toBeNull();
      expect(useStatsStore.getState().tierDrop).toBeNull();
    });

    it('keeps the window closed on the copy held here', async () => {
      const id = await oldAnswer();
      usePredictionStore.setState({ getById: failing });

      await expect(usePredictionStore.getState().correct(id, 'resolved_yes')).rejects.toThrow(
        /part of the record/,
      );
      expect((await getPrediction(id))?.status).toBe('resolved_no');
    });

    it('holds the stats as stored when the switch fails to commit', async () => {
      const p = await answer('resolved_no');
      expect(useStatsStore.getState().calibration.buckets[0]?.resolved_yes).toBe(0);
      const db = getDb();
      const realTransaction = db.transaction.bind(db);
      let calls = 0;
      db.transaction = async <T,>(fn: () => Promise<T>) => {
        calls += 1;
        if (calls > 1) return realTransaction(fn);
        return realTransaction(async () => {
          await fn();
          throw new Error('commit failed');
        });
      };

      try {
        await expect(usePredictionStore.getState().correct(p.id, 'resolved_yes')).rejects.toThrow(
          'commit failed',
        );
      } finally {
        db.transaction = realTransaction;
      }

      expect((await getPrediction(p.id))?.status).toBe('resolved_no');
      // Not the rolled-back Yes the recompute had set in memory.
      expect(useStatsStore.getState().calibration.buckets[0]?.resolved_yes).toBe(0);
      expect(useStatsStore.getState().milestone).toBeNull();
    });

    it('writes nothing when the read fails and no copy is held', async () => {
      const p = await answer('resolved_no');
      usePredictionStore.setState({ resolved: [], pending: [], getById: failing });

      await expect(usePredictionStore.getState().correct(p.id, 'resolved_yes')).rejects.toThrow(
        'read failed',
      );
      expect((await getPrediction(p.id))?.status).toBe('resolved_no');
    });
  });

  it('switches No to Yes in place, keeping when it was answered', async () => {
    const before = await answer('resolved_no');
    await usePredictionStore.getState().correct(before.id, 'resolved_yes');
    const after = usePredictionStore.getState().resolved.find((r) => r.id === before.id)!;
    expect(after.status).toBe('resolved_yes');
    expect(after.resolved_at).toBe(before.resolved_at);
    expect(usePredictionStore.getState().pending).toHaveLength(0);
    expect(useStatsStore.getState().calibration.buckets[0]?.resolved_yes).toBe(1);
  });

  it('moves an answer to another category, with its counts', async () => {
    const p = await answer();
    await usePredictionStore.getState().refile(p.id, 'health');
    const stats = await listCategoryStats(p.user_id);
    expect(stats.find((c) => c.category === 'health')?.predictions_resolved).toBe(1);
    expect(stats.find((c) => c.category === 'work')).toBeUndefined();
  });

  // Step 184 (D65): each category's score follows where an answer is filed,
  // so a scored answer left somewhere else is counted on Insights.
  it('counts a scored answer left in another category, once', async () => {
    const p = await answer();
    await usePredictionStore.getState().refile(p.id, 'health');
    expect(usePredictionStore.getState().refiledCount).toBe(1);
    await usePredictionStore.getState().refile(p.id, 'finance');
    expect(usePredictionStore.getState().refiledCount).toBe(1);
  });

  it('takes an answer moved back off the count', async () => {
    const p = await answer();
    await usePredictionStore.getState().refile(p.id, 'health');
    await usePredictionStore.getState().refile(p.id, 'work');
    expect(usePredictionStore.getState().refiledCount).toBe(0);
  });

  it('counts a moved answer that is then deleted as a deletion only', async () => {
    const p = await answer();
    await usePredictionStore.getState().refile(p.id, 'health');
    await usePredictionStore.getState().remove(p.id);
    expect(usePredictionStore.getState().refiledCount).toBe(0);
    expect(usePredictionStore.getState().deletedCount).toBe(1);
  });

  it("doesn't count a same-day answer that is moved: it was never scored", async () => {
    const made = await usePredictionStore.getState().create({
      title: 'Same day',
      category: 'work',
      confidence: 70,
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await usePredictionStore.getState().resolve(made.id, 'resolved_no');
    await usePredictionStore.getState().refile(made.id, 'health');
    expect(usePredictionStore.getState().refiledCount).toBe(0);
  });

  it('deletes an answer inside the window', async () => {
    const p = await answer();
    await usePredictionStore.getState().remove(p.id);
    expect(usePredictionStore.getState().resolved).toHaveLength(0);
  });

  it('refuses all three once the window has closed', async () => {
    const id = await oldAnswer();
    const s = usePredictionStore.getState();
    await expect(s.correct(id, 'resolved_yes')).rejects.toThrow(/part of the record/);
    await expect(s.refile(id, 'health')).rejects.toThrow(/part of the record/);
    await expect(s.remove(id)).rejects.toThrow(/part of the record/);
    expect(usePredictionStore.getState().resolved[0]).toMatchObject({
      status: 'resolved_no',
      category: 'work',
    });
  });

  it('never corrects a skip', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Unclear',
      category: 'work',
      confidence: 70,
      due_date: '2026-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(p.id, 'skipped');
    await expect(usePredictionStore.getState().correct(p.id, 'resolved_no')).rejects.toThrow();
  });
});

// Roadmap D39: a category the person added counts like any other.
// Roadmap D41: an answer given the day the prediction was logged isn't scored.
describe('same-day answers', () => {
  it('leave the rating and the category alone, and still keep the streak', async () => {
    const p = await usePredictionStore.getState().create({
      title: 'Pay the electric bill',
      category: 'finance',
      confidence: 80,
      due_date: '2026-06-01T12:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');

    const stats = useStatsStore.getState();
    expect(usePredictionStore.getState().resolved).toHaveLength(1);
    expect(stats.userStat?.total_predictions).toBe(1);
    expect(stats.userStat?.total_resolved).toBe(0);
    expect(stats.userStat?.current_streak).toBe(1);
    expect(stats.categoryStats.find((c) => c.category === 'finance')).toMatchObject({
      predictions_made: 1,
      predictions_resolved: 0,
    });
    expect(stats.calibration.buckets).toHaveLength(0);
  });

  it('count once logged the day before', async () => {
    const p = await loggedEarlier(() =>
      usePredictionStore.getState().create({
        title: 'Pay the electric bill',
        category: 'finance',
        confidence: 80,
        due_date: '2026-06-01T12:00:00.000Z',
      }),
    );
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect(useStatsStore.getState().userStat?.total_resolved).toBe(1);
  });
});

describe('predictionStore with an added category', () => {
  it('logs, answers and scores a prediction filed under it', async () => {
    const p = await loggedEarlier(() => usePredictionStore.getState().create({
      title: 'Thesis chapter done',
      category: 'c-grad123456',
      confidence: 70,
      due_date: '2026-06-01T12:00:00.000Z',
    }));
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    const stats = await listCategoryStats(p.user_id);
    expect(stats.map((s) => s.category)).toEqual(['c-grad123456']);
    expect(useStatsStore.getState().categoryStats[0]).toMatchObject({
      category: 'c-grad123456',
      predictions_resolved: 1,
    });
  });
});

// Roadmap D56: History's answered details say "Logged again" while the same
// words are open, by D32's titleKey.
describe('openRepeatOf', () => {
  const p = (id: string, title: string, due: string, status: 'pending' | 'resolved_yes' = 'pending') => ({
    id,
    user_id: 'u1',
    title,
    category: 'health' as const,
    confidence: 80,
    created_at: '2026-11-01T08:00:00.000Z',
    due_date: due,
    status,
    resolved_at: status === 'pending' ? null : '2026-11-02T19:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  });
  const source = p('a', 'I walk 30 minutes', '2026-11-02T12:00:00.000Z', 'resolved_yes');

  it('finds the soonest open one with the same words, case and end punctuation aside', () => {
    const later = p('b', 'i walk 30 minutes.', '2026-11-20T12:00:00.000Z');
    const sooner = p('c', 'I walk 30 minutes', '2026-11-12T12:00:00.000Z');
    const other = p('d', 'I swim', '2026-11-11T12:00:00.000Z');
    expect(openRepeatOf(source, [later, other, sooner])?.id).toBe('c');
  });

  it('is null with none open, and never the prediction itself', () => {
    expect(openRepeatOf(source, [p('d', 'I swim', '2026-11-11T12:00:00.000Z')])).toBeNull();
    const self = { ...source, status: 'pending' as const };
    expect(openRepeatOf(self, [self])).toBeNull();
  });

  // Blind playtest 2026-11-12f, run 7: the same words under another category
  // read as "Logged again".
  it('only counts the same category', () => {
    const elsewhere = { ...p('e', 'I walk 30 minutes', '2026-11-12T12:00:00.000Z'), category: 'work' as const };
    expect(openRepeatOf(source, [elsewhere])).toBeNull();
  });
});


// Step 173 (aggregate B1; record audit 2026-11-12): a due date moved later the
// day before it or after is counted on Insights, once per prediction, and the
// count outlives a delete.
describe('late due-date moves', () => {
  const DAY = 86_400_000;
  const create = (dueInDays: number, title = 'Rain by Friday') =>
    usePredictionStore.getState().create({
      title,
      category: 'work',
      confidence: 70,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });

  it('counts a move later on the eve, once, and keeps it after a delete', async () => {
    // Logged yesterday, due tomorrow: today is its eve.
    const p = await loggedEarlier(() => create(2));
    const move = (days: number) =>
      usePredictionStore.getState().update(p.id, {
        title: p.title,
        category: 'work',
        due_date: new Date(Date.now() + days * DAY).toISOString(),
      });
    await move(5);
    expect(usePredictionStore.getState().postponedCount).toBe(1);
    await move(9);
    expect(usePredictionStore.getState().postponedCount).toBe(1);
    await usePredictionStore.getState().remove(p.id);
    await usePredictionStore.getState().loadResolved();
    expect(usePredictionStore.getState().postponedCount).toBe(1);
  });

  it('leaves an early move, and a move earlier, uncounted', async () => {
    const early = await create(6, 'Early one');
    await usePredictionStore.getState().update(early.id, {
      title: early.title,
      category: 'work',
      due_date: new Date(Date.now() + 10 * DAY).toISOString(),
    });
    const eve = await create(1, 'Eve one');
    await usePredictionStore.getState().update(eve.id, {
      title: eve.title,
      category: 'work',
      due_date: new Date(Date.now() + 1 * DAY).toISOString(),
    });
    await usePredictionStore.getState().loadResolved();
    expect(usePredictionStore.getState().postponedCount).toBe(0);
  });
});

describe('changes on the day made, and late rewording (D62)', () => {
  const DAY = 86_400_000;
  const create = (dueInDays: number, title = 'Rain by Friday') =>
    usePredictionStore.getState().create({
      title,
      category: 'work',
      confidence: 70,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });

  it('leaves a move on the day it was made uncounted', async () => {
    const p = await create(1);
    await usePredictionStore.getState().update(p.id, {
      title: p.title,
      category: 'work',
      due_date: new Date(Date.now() + 4 * DAY).toISOString(),
    });
    expect(usePredictionStore.getState().postponedCount).toBe(0);
  });

  it('counts new words on the eve, which keep the date', async () => {
    const p = await loggedEarlier(() => create(2));
    await usePredictionStore.getState().update(p.id, {
      title: 'No rain by Friday',
      category: 'work',
      due_date: p.due_date,
    });
    expect(usePredictionStore.getState().postponedCount).toBe(1);
    const after = await usePredictionStore.getState().getById(p.id);
    expect(after?.due_date).toBe(p.due_date);
  });

  it('leaves a typo fixed on the eve uncounted', async () => {
    const p = await loggedEarlier(() => create(2));
    await usePredictionStore.getState().update(p.id, {
      title: 'rain by friday.',
      category: 'work',
      due_date: p.due_date,
    });
    expect(usePredictionStore.getState().postponedCount).toBe(0);
  });

  it('replaces one made today with another number, uncounted', async () => {
    const p = await create(1);
    const next = await usePredictionStore.getState().renumber(p.id, {
      title: p.title,
      category: 'work',
      confidence: 85,
      due_date: p.due_date,
    });
    expect(next.confidence).toBe(85);
    expect(await usePredictionStore.getState().getById(p.id)).toBeNull();
    await usePredictionStore.getState().loadResolved();
    expect(usePredictionStore.getState().deletedCount).toBe(0);
    expect(usePredictionStore.getState().pending.map((x) => x.id)).toEqual([next.id]);
  });

  it('refuses one logged earlier and only reworded today (code review)', async () => {
    const p = await loggedEarlier(() => create(3));
    await usePredictionStore.getState().update(p.id, {
      title: 'The parcel comes late',
      category: 'work',
      due_date: p.due_date,
    });
    await expect(
      usePredictionStore.getState().renumber(p.id, {
        title: 'The parcel comes late',
        category: 'work',
        confidence: 40,
        due_date: p.due_date,
      }),
    ).rejects.toThrow('part of the record');
  });

  it('refuses to replace one made before today', async () => {
    const p = await loggedEarlier(() => create(3));
    await expect(
      usePredictionStore.getState().renumber(p.id, {
        title: p.title,
        category: 'work',
        confidence: 85,
        due_date: p.due_date,
      }),
    ).rejects.toThrow('part of the record');
    expect(await usePredictionStore.getState().getById(p.id)).not.toBeNull();
    expect(usePredictionStore.getState().pending).toHaveLength(1);
  });
});

// Step 181 (blind playtest 2026-11-14, finding 16): "Save and log another"
// twice read alike, and one was logged twice.
describe('openTwinFor', () => {
  const p = (id: string, title: string, due: string, status: 'pending' | 'resolved_yes' = 'pending') => ({
    id,
    user_id: 'u1',
    title,
    category: 'health' as const,
    confidence: 80,
    created_at: '2026-11-01T08:00:00.000Z',
    due_date: due,
    status,
    resolved_at: status === 'pending' ? null : '2026-11-02T19:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  });
  const due = new Date(2026, 10, 13, 12).toISOString();
  const sameDayLater = new Date(2026, 10, 13, 20).toISOString();
  const nextDay = new Date(2026, 10, 14, 12).toISOString();

  it('finds the same words open for the same day, whatever the category', () => {
    const open = [p('a', 'Dani is late.', sameDayLater), p('b', 'Maya comes', due)];
    expect(openTwinFor('  dani is late ', due, open)?.id).toBe('a');
    expect(openTwinFor('Dani is late', nextDay, open)).toBeNull();
    expect(openTwinFor('Someone else is late', due, open)).toBeNull();
    expect(openTwinFor('', due, open)).toBeNull();
  });

  it('leaves out an answered one and the one being replaced', () => {
    expect(openTwinFor('Dani is late', due, [p('a', 'Dani is late', due, 'resolved_yes')])).toBeNull();
    expect(openTwinFor('Dani is late', due, [p('a', 'Dani is late', due)], 'a')).toBeNull();
  });
});

// Step 181 (blind playtest 2026-11-14, finding 15).
describe('rewordedLater', () => {
  const base = {
    id: 'a',
    user_id: 'u1',
    title: 'It rains',
    category: 'personal' as const,
    confidence: 70,
    due_date: new Date(2026, 10, 16, 12).toISOString(),
    status: 'pending' as const,
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
  };
  const logged = new Date(2026, 10, 14, 8).toISOString();

  it('is only for words changed on a later day than it was logged', () => {
    expect(rewordedLater({ ...base, created_at: logged })).toBe(false);
    expect(
      rewordedLater({ ...base, created_at: logged, title_edited_at: new Date(2026, 10, 14, 21).toISOString() }),
    ).toBe(false);
    expect(
      rewordedLater({ ...base, created_at: logged, title_edited_at: new Date(2026, 10, 15, 7).toISOString() }),
    ).toBe(true);
  });

  // 2026-11-19: each day read where it happened.
  it('reads both days in their stored offsets', () => {
    // Logged Wed 20:00 in New York (Thu 01:00 UTC), reworded Thu 09:00 in
    // London: a later day where each happened, though one UTC day.
    const travelled = {
      ...base,
      created_at: '2026-11-19T01:00:00.000Z',
      created_utc_offset_min: -300,
      title_edited_at: '2026-11-19T09:00:00.000Z',
      title_edited_utc_offset_min: 0,
    };
    expect(rewordedLater(travelled)).toBe(true);
  });

  // Round 6: the same-day rule reads both in the rewording's zone, so the
  // rewording note is used whenever "You logged this today" could be untrue
  // in either reading.
  it("says reworded when the rewording's zone puts the two on different days", () => {
    // Logged Thu 07:00 in Tokyo (Wed 22:00 UTC), reworded Thu 00:30 in
    // London: one Thursday where each happened, Wednesday and Thursday in
    // London, where an answer is now judged.
    const p = {
      ...base,
      created_at: '2026-11-18T22:00:00.000Z',
      created_utc_offset_min: 540,
      title_edited_at: '2026-11-19T00:30:00.000Z',
      title_edited_utc_offset_min: 0,
    };
    expect(rewordedLater(p)).toBe(true);
    // The same day in both readings: logged and reworded Thursday in London.
    expect(
      rewordedLater({ ...p, created_at: '2026-11-19T00:10:00.000Z', created_utc_offset_min: 0 }),
    ).toBe(false);
  });
});

/** Run `fn` with the clock (Date only) at `iso`, as loggedEarlier does. */
async function atTime<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  jest.useFakeTimers({
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
    now: new Date(iso),
  });
  try {
    return await fn();
  } finally {
    jest.useRealTimers();
  }
}

// Owner decision 2026-11-19 (record audit: 20 answers given the day they
// were logged in New York all counted once the phone was in London). The
// logging and the rewording are stored with the phone's UTC offset, and the
// same-day rule reads both days in that one (review round 6: never in the
// zone the answer was given in).
describe('same-day answers across a time-zone change', () => {
  afterEach(() => __setTimeZoneForTests(null));

  const userId = () => useAuthStore.getState().userId!;
  const log = (title: string) =>
    usePredictionStore.getState().create({
      title,
      category: 'health',
      confidence: 95,
      due_date: '2026-11-21T17:00:00.000Z',
    });
  const scored = () => useStatsStore.getState().userStat?.total_resolved;

  it('keeps 20 answered the day they were logged in New York unscored once the phone is in London', async () => {
    __setTimeZoneForTests('America/New_York');
    const ids: string[] = [];
    // Logged Wed Nov 18 at 09:00 New York time.
    for (let i = 0; i < 20; i += 1) {
      ids.push((await atTime('2026-11-18T14:00:00.000Z', () => log(`Sure thing ${i}`))).id);
    }
    // Answered at 22:00 the same evening: 03:00 Thursday in London.
    for (const id of ids) {
      await atTime('2026-11-19T03:00:00.000Z', () =>
        usePredictionStore.getState().resolve(id, 'resolved_yes'),
      );
    }
    const first = await getPrediction(ids[0]);
    expect(first).toMatchObject({ created_utc_offset_min: -300 });
    // No answer offset since round 6.
    expect(first).not.toHaveProperty('resolved_utc_offset_min');
    expect(scored()).toBe(0);

    __setTimeZoneForTests('Europe/London');
    await useStatsStore.getState().recomputeForUser(userId());
    expect(scored()).toBe(0);
    expect(useStatsStore.getState().userStat?.rating_is_provisional).toBe(true);

    // The same rows without offsets, as every row before this build: read
    // in London as before, they count (the reading kept for old rows).
    await getDb().run(`UPDATE predictions SET created_utc_offset_min = NULL`);
    await useStatsStore.getState().recomputeForUser(userId());
    expect(scored()).toBe(20);
  });

  // Review round 6, the record auditor's padding route: 20 sure things logged
  // at 08:00 in New York, the phone set to UTC+14 (already 03:00 the next day
  // there), answered at once. Round 5 scored all twenty.
  it("scores none of the auditor's 20, logged in New York and answered at once at UTC+14", async () => {
    __setTimeZoneForTests('America/New_York');
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push((await atTime('2026-11-18T13:00:00.000Z', () => log(`Sure ${i}`))).id);
    }
    __setTimeZoneForTests('Pacific/Kiritimati');
    const p = (await getPrediction(ids[0]))!;
    expect(answerNowIsSameDay(p, new Date('2026-11-18T13:05:00.000Z'))).toBe(true);
    for (const id of ids) {
      await atTime('2026-11-18T13:05:00.000Z', () =>
        usePredictionStore.getState().resolve(id, 'resolved_yes'),
      );
    }
    expect(scored()).toBe(0);
    expect(useStatsStore.getState().userStat?.rating_is_provisional).toBe(true);
    // Read anywhere, still none.
    for (const zone of ['America/New_York', 'Europe/London', 'Pacific/Kiritimati']) {
      __setTimeZoneForTests(zone);
      await useStatsStore.getState().recomputeForUser(userId());
      expect({ zone, scored: scored() }).toEqual({ zone, scored: 0 });
    }
  });

  it('leaves a traveller unscored until the next day has begun where it was logged, then scores', async () => {
    __setTimeZoneForTests('America/New_York');
    // Wed Nov 18 at 20:00 in New York, twice.
    const early = await atTime('2026-11-19T01:00:00.000Z', () => log('Lands on time'));
    const late = await atTime('2026-11-19T01:00:00.000Z', () => log('Bags arrive'));
    __setTimeZoneForTests('Europe/London');
    // Thu 03:00 in London is Wed 22:00 in New York: still the day it was logged.
    expect(answerNowIsSameDay(early, new Date('2026-11-19T03:00:00.000Z'))).toBe(true);
    await atTime('2026-11-19T03:00:00.000Z', () =>
      usePredictionStore.getState().resolve(early.id, 'resolved_yes'),
    );
    expect(scored()).toBe(0);
    // Thu 05:30 in London is Thu 00:30 in New York: scored.
    expect(answerNowIsSameDay(late, new Date('2026-11-19T05:30:00.000Z'))).toBe(false);
    await atTime('2026-11-19T05:30:00.000Z', () =>
      usePredictionStore.getState().resolve(late.id, 'resolved_yes'),
    );
    expect(scored()).toBe(1);
  });

  // Record audit (round 6): "Use another number" refused an hour after
  // logging, and a fix 30 minutes after logging was counted, for a traveller.
  it("keeps a traveller's day of logging for Use another number and the late-change exemption", async () => {
    __setTimeZoneForTests('America/New_York');
    // Wed Nov 18 at 23:00 in New York, due Fri Nov 20.
    const p = await atTime('2026-11-19T04:00:00.000Z', () =>
      usePredictionStore.getState().create({
        title: 'Train is on time',
        category: 'work',
        confidence: 70,
        due_date: '2026-11-20T17:00:00.000Z',
      }),
    );
    __setTimeZoneForTests('Europe/London');
    // Thu 04:30 in London, the eve of the due day there; 23:30 Wednesday in
    // New York, still the day it was logged.
    const halfHour = new Date('2026-11-19T04:30:00.000Z');
    expect(canRenumber(p, halfHour)).toBe(true);
    expect(moveIsCounted(p, '2026-11-23T17:00:00.000Z', p.title, halfHour)).toBe(false);
    await atTime(halfHour.toISOString(), () =>
      usePredictionStore.getState().update(p.id, {
        title: p.title,
        category: 'work',
        due_date: '2026-11-23T17:00:00.000Z',
      }),
    );
    await usePredictionStore.getState().loadResolved();
    expect(usePredictionStore.getState().postponedCount).toBe(0);
    // Thu 05:30 in London is Thursday in New York too: closed, and counted.
    const moved = (await usePredictionStore.getState().getById(p.id))!;
    expect(canRenumber(moved, new Date('2026-11-19T05:30:00.000Z'))).toBe(false);
  });

  it('and keeps 20 scored in London scored once the phone is in New York', async () => {
    __setTimeZoneForTests('Europe/London');
    const ids: string[] = [];
    // Logged Wed Nov 18 at 23:30 in London, answered Thu at 00:30: the next
    // day there, one Wednesday evening in New York.
    for (let i = 0; i < 20; i += 1) {
      ids.push((await atTime('2026-11-18T23:30:00.000Z', () => log(`Late one ${i}`))).id);
    }
    for (const id of ids) {
      await atTime('2026-11-19T00:30:00.000Z', () =>
        usePredictionStore.getState().resolve(id, 'resolved_yes'),
      );
    }
    expect(scored()).toBe(20);

    __setTimeZoneForTests('America/New_York');
    await useStatsStore.getState().recomputeForUser(userId());
    expect(scored()).toBe(20);
  });

  it('scores a traveller who logs in New York and answers the next morning in London', async () => {
    __setTimeZoneForTests('America/New_York');
    // Wed Nov 18 at 20:00 in New York.
    const p = await atTime('2026-11-19T01:00:00.000Z', () => log('Flight lands on time'));
    // Later that evening in New York, an answer would be same-day.
    expect(answerNowIsSameDay(p, new Date('2026-11-19T02:00:00.000Z'))).toBe(true);

    __setTimeZoneForTests('Europe/London');
    // Thu Nov 19 at 09:00 in London: the next day where it was logged.
    expect(answerNowIsSameDay(p, new Date('2026-11-19T09:00:00.000Z'))).toBe(false);
    await atTime('2026-11-19T09:00:00.000Z', () =>
      usePredictionStore.getState().resolve(p.id, 'resolved_yes'),
    );
    const answered = await getPrediction(p.id);
    expect(answered).toMatchObject({
      created_utc_offset_min: -300,
      resolved_at: '2026-11-19T09:00:00.000Z',
    });
    expect(answered).not.toHaveProperty('resolved_utc_offset_min');
    expect(scored()).toBe(1);
  });

  it("keeps the first answer's time through a correction in another zone (D34)", async () => {
    __setTimeZoneForTests('America/New_York');
    const p = await atTime('2026-11-18T14:00:00.000Z', () => log('Same-day one'));
    await atTime('2026-11-19T03:00:00.000Z', () =>
      usePredictionStore.getState().resolve(p.id, 'resolved_yes'),
    );
    __setTimeZoneForTests('Europe/London');
    await atTime('2026-11-19T05:00:00.000Z', () =>
      usePredictionStore.getState().correct(p.id, 'resolved_no'),
    );
    expect(await getPrediction(p.id)).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    // Still the day it was logged, read where it was logged: not scored.
    expect(scored()).toBe(0);
  });

  it("gives a Can't tell answered later in another zone that answer's time, read where it was logged", async () => {
    __setTimeZoneForTests('America/New_York');
    const p = await atTime('2026-11-18T14:00:00.000Z', () => log('Hard to say'));
    await atTime('2026-11-21T23:00:00.000Z', () =>
      usePredictionStore.getState().resolve(p.id, 'skipped'),
    );
    __setTimeZoneForTests('Europe/London');
    await atTime('2026-11-23T10:00:00.000Z', () =>
      usePredictionStore.getState().resolve(p.id, 'resolved_yes', undefined, { answeringSkip: true }),
    );
    const answered = await getPrediction(p.id);
    expect(answered).toMatchObject({
      status: 'resolved_yes',
      resolved_at: '2026-11-23T10:00:00.000Z',
    });
    expect(answered).not.toHaveProperty('resolved_utc_offset_min');
    // Monday in New York, days after it was logged: scored.
    expect(scored()).toBe(1);
  });

  it('dates new words with the offset they were written in (D45)', async () => {
    __setTimeZoneForTests('America/New_York');
    const p = await atTime('2026-11-16T14:00:00.000Z', () => log('Knee is fine'));
    __setTimeZoneForTests('Asia/Tokyo');
    await atTime('2026-11-18T01:00:00.000Z', () =>
      usePredictionStore.getState().update(p.id, {
        title: 'Knee still hurts',
        category: 'health',
        due_date: p.due_date,
      }),
    );
    expect(await getPrediction(p.id)).toMatchObject({
      title_edited_at: '2026-11-18T01:00:00.000Z',
      title_edited_utc_offset_min: 540,
      created_utc_offset_min: -300,
    });
  });
});

// Review round 5: answering a Can't tell reopened it and then answered it,
// and a push could read the open row in between.
describe("answering a Can't tell", () => {
  it('writes the answer over the skip in one statement, never through open', async () => {
    const p = await loggedEarlier(
      () =>
        usePredictionStore.getState().create({
          title: 'Hard to say',
          category: 'work',
          confidence: 60,
          due_date: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      2,
    );
    await usePredictionStore.getState().resolve(p.id, 'skipped');
    const db = getDb();
    const realRun = db.run.bind(db);
    const writes: string[] = [];
    db.run = async (sql, params) => {
      if (/UPDATE predictions/.test(sql)) writes.push(sql);
      return realRun(sql, params);
    };
    try {
      await usePredictionStore
        .getState()
        .resolve(p.id, 'resolved_yes', undefined, { answeringSkip: true });
    } finally {
      db.run = realRun;
    }
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/status = 'skipped'/);
    expect(writes.some((sql) => /'pending'/.test(sql))).toBe(false);
    expect((await getPrediction(p.id))?.status).toBe('resolved_yes');
  });
});

// Owner decision 2026-11-19 (record audit: moving a likely miss to another
// category before answering left no trace, refiledCount 0): an open
// prediction's category changed from the eve of its due day on is counted
// like a late due-date move, once per prediction, on this phone only.
describe('late category changes', () => {
  const DAY = 86_400_000;
  const create = (dueInDays: number) =>
    usePredictionStore.getState().create({
      title: 'Knee is fine by Friday',
      category: 'health',
      confidence: 80,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });
  const moveTo = (p: { id: string; title: string; due_date: string }, category: 'health' | 'personal' | 'work') =>
    usePredictionStore.getState().update(p.id, { title: p.title, category, due_date: p.due_date });
  const counted = () => usePredictionStore.getState().postponedCount;

  it("counts the auditor's sequence once: on the eve, health to personal, then a No", async () => {
    // Logged yesterday, due tomorrow: today is its eve.
    const p = await loggedEarlier(() => create(2));
    expect(categoryChangeIsCounted(p, 'personal')).toBe(true);
    expect(categoryChangeIsCounted(p, 'health')).toBe(false);
    await moveTo(p, 'personal');
    expect(counted()).toBe(1);
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(1);
    // Not a move of an answer (D65), so not counted twice.
    expect(usePredictionStore.getState().refiledCount).toBe(0);
  });

  it('leaves a change on the day it was made uncounted', async () => {
    const p = await create(1);
    expect(categoryChangeIsCounted(p, 'personal')).toBe(false);
    await moveTo(p, 'personal');
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(0);
  });

  it('leaves a change two days before the due day uncounted', async () => {
    // Logged yesterday, due the day after tomorrow.
    const p = await loggedEarlier(() => create(3));
    expect(categoryChangeIsCounted(p, 'personal')).toBe(false);
    await moveTo(p, 'personal');
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(0);
  });

  it('counts it once when moved twice, even back where it started', async () => {
    const p = await loggedEarlier(() => create(2));
    await moveTo(p, 'personal');
    await moveTo(p, 'work');
    await moveTo(p, 'health');
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(1);
  });

  it('keeps the count after a delete, and Erase clears it', async () => {
    const p = await loggedEarlier(() => create(2));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().remove(p.id);
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(1);

    await wipeLocalUserData(useAuthStore.getState().userId!);
    await usePredictionStore.getState().loadResolved();
    expect(counted()).toBe(0);
  });

  it('is never counted for an answered prediction', async () => {
    const p = await loggedEarlier(() => create(2));
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    const answered = (await usePredictionStore.getState().getById(p.id))!;
    expect(categoryChangeIsCounted(answered, 'personal')).toBe(false);
  });
});

// Review round 6 (owner decision 2026-11-19, widening D69 (e); record audit:
// a move two days early, then "Answer it now", left no trace). The category
// a prediction had at its first move after the day it was made is
// remembered, and a scored answer given elsewhere is counted with the moved
// answers (refiledCount, D65), once.
describe('a category change counted at the answer', () => {
  const DAY = 86_400_000;
  const create = (dueInDays: number, title = 'Knee is fine by Friday') =>
    usePredictionStore.getState().create({
      title,
      category: 'health',
      confidence: 80,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });
  type Movable = { id: string; title: string; due_date: string };
  const moveTo = (p: Movable, category: 'health' | 'personal' | 'work', title = p.title) =>
    usePredictionStore.getState().update(p.id, { title, category, due_date: p.due_date });
  const counts = async () => {
    await usePredictionStore.getState().loadResolved();
    const s = usePredictionStore.getState();
    return { moved: s.refiledCount, late: s.postponedCount, deleted: s.deletedCount };
  };
  const tomorrow = () => new Date(Date.now() + DAY).toISOString();

  it("counts the auditor's sequence once: two days early, moved, Answer it now, No", async () => {
    // Logged yesterday, due in three days: today is not its eve.
    const p = await loggedEarlier(() => create(4));
    expect(categoryChangeIsCounted(p, 'personal')).toBe(false);
    expect(categoryChangeCountedIfAnswered(p, 'personal', null)).toBe(true);
    await moveTo(p, 'personal');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
      from_category: 'health',
      counted_late: false,
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });

  it('counts nothing when it is moved back before the answer', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    const moved = (await usePredictionStore.getState().getById(p.id))!;
    const origin = usePredictionStore.getState().categoryOrigins[p.id] ?? null;
    expect(categoryChangeCountedIfAnswered(moved, 'health', origin)).toBe(false);
    expect(categoryChangeCountedIfAnswered(moved, 'work', origin)).toBe(true);
    await moveTo(p, 'health');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  it('counts nothing for a move on the day it was made, answered the next day', async () => {
    const p = await create(4);
    expect(categoryChangeCountedIfAnswered(p, 'personal', null)).toBe(false);
    await moveTo(p, 'personal');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toBeUndefined();
    await atTime(tomorrow(), () => usePredictionStore.getState().resolve(p.id, 'resolved_no'));
    expect((await usePredictionStore.getState().getById(p.id))?.status).toBe('resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  // Never twice: the eve's change is on the late-changes line (D69 (e)), and
  // its answer isn't added to the moved answers.
  it('counts a change on the eve once only, as a late change, after the answer too', async () => {
    const p = await loggedEarlier(() => create(2));
    expect(categoryChangeIsCounted(p, 'personal')).toBe(true);
    expect(categoryChangeCountedIfAnswered(p, 'personal', null)).toBe(false);
    await moveTo(p, 'personal');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
      from_category: 'health',
      counted_late: true,
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  it('counts an early move then an eve move once only, as a late change', async () => {
    // Logged two days ago, due tomorrow. Moved yesterday, two days before the
    // due day (remembered, not late), then again today, the eve (late).
    const p = await loggedEarlier(() => create(3), 2);
    await atTime(new Date(Date.now() - DAY).toISOString(), () => moveTo(p, 'personal'));
    expect(usePredictionStore.getState().categoryOrigins[p.id]?.counted_late).toBe(false);
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
    const now = (await usePredictionStore.getState().getById(p.id))!;
    expect(categoryChangeIsCounted(now, 'work')).toBe(true);
    await moveTo(p, 'work');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
      from_category: 'health',
      counted_late: true,
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  it('counts nothing for a same-day answer: it was never scored', async () => {
    // Logged two days ago, moved today, and reworded in the same edit: the
    // new words make it a prediction made today (D45), so an answer today
    // isn't scored.
    const p = await loggedEarlier(() => create(5), 2);
    await moveTo(p, 'personal', 'Knee still hurts by Friday');
    expect(usePredictionStore.getState().categoryOrigins[p.id]?.from_category).toBe('health');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    const answered = (await usePredictionStore.getState().getById(p.id))!;
    expect(answerNowIsSameDay(answered)).toBe(true);
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  it("counts nothing for a Can't tell, and counts the Yes it is later answered with", async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'skipped');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
    await atTime(tomorrow(), () =>
      usePredictionStore.getState().resolve(p.id, 'resolved_yes', undefined, { answeringSkip: true }),
    );
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });

  it('counts a moved answer that is then deleted once, as a deletion (D65)', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
    await usePredictionStore.getState().remove(p.id);
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 1 });
    expect(await listCategoryOrigins(useAuthStore.getState().userId!)).toEqual([]);
  });

  it('takes a moved answer off the count when it is moved back after the answer (D65)', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    await usePredictionStore.getState().refile(p.id, 'work');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
    await usePredictionStore.getState().refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  it('counts nothing when the answer came from another phone, not this one', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    const here = (await usePredictionStore.getState().getById(p.id))!;
    // Answered on another phone and pulled before this phone's answer.
    await upsertPredictionFromRemote({
      ...here,
      status: 'resolved_no',
      resolved_at: new Date(Date.now() - 60_000).toISOString(),
      title_edited_at: null,
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
    expect((await usePredictionStore.getState().getById(p.id))?.status).toBe('resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  it('still loads the open list when reading what is remembered fails, and still counts the answer', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = getDb();
    const realAll = db.all.bind(db);
    db.all = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('FROM prediction_category_origins')) throw new Error('forced failure');
      return realAll<T>(sql, params);
    };
    try {
      usePredictionStore.setState({ pending: [], categoryOrigins: {} });
      await usePredictionStore.getState().loadPending();
      expect(usePredictionStore.getState().pending.map((x) => x.id)).toEqual([p.id]);
      expect(usePredictionStore.getState().categoryOrigins).toEqual({});
      // The answer reads what is remembered itself, inside its transaction.
      await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    } finally {
      db.all = realAll;
      warn.mockRestore();
    }
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });

  // Main session decision 2026-11-19: sign-out keeps this phone's counts.
  it('keeps the counts and what is remembered through sign-out; Erase clears them', async () => {
    const userId = useAuthStore.getState().userId!;
    const answered = await loggedEarlier(() => create(4, 'Answered one'));
    await moveTo(answered, 'personal');
    await usePredictionStore.getState().resolve(answered.id, 'resolved_no');
    const open = await loggedEarlier(() => create(4, 'Open one'));
    await moveTo(open, 'work');
    const openRow = (await usePredictionStore.getState().getById(open.id))!;

    await wipeLocalUserData(userId, { deviceData: false, keepIntegrityCounts: true });
    expect(await listPendingPredictions(userId)).toEqual([]);
    expect(await countRefiles(userId)).toBe(1);
    expect((await listCategoryOrigins(userId)).map((o) => o.prediction_id).sort()).toEqual(
      [answered.id, open.id].sort(),
    );

    // Signed back in: the open one comes back from the server, still moved,
    // and its answer is counted against what this phone remembered.
    await upsertPredictionFromRemote({
      ...openRow,
      title_edited_at: null,
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    await usePredictionStore.getState().resolve(open.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 2, late: 0, deleted: 0 });

    await wipeLocalUserData(userId);
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
    expect(await listCategoryOrigins(userId)).toEqual([]);
  });

  // Review round 7 (owner decision 2026-11-19; the record auditor's route E):
  // a rewording no longer moves the day a category move is exempt on.
  it('counts route E: new words, a move the same day, an answer the next day', async () => {
    // Logged two days ago, due in three days: today is not its eve.
    const p = await loggedEarlier(() => create(5), 2);
    await moveTo(p, 'health', 'Knee still hurts by Friday');
    const reworded = (await usePredictionStore.getState().getById(p.id))!;
    expect(reworded.title_edited_at).toBeTruthy();
    expect(categoryChangeCountedIfAnswered(reworded, 'personal', null)).toBe(true);
    await moveTo(reworded, 'personal');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
      from_category: 'health',
      counted_late: false,
    });
    await atTime(tomorrow(), () => usePredictionStore.getState().resolve(p.id, 'resolved_no'));
    expect((await usePredictionStore.getState().getById(p.id))?.status).toBe('resolved_no');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });

  it('counts new words on the eve and a move later that day once, as a late change', async () => {
    // Logged yesterday, due tomorrow: today is its eve.
    const p = await loggedEarlier(() => create(2));
    await moveTo(p, 'health', 'Knee still hurts by Friday');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
    const reworded = (await usePredictionStore.getState().getById(p.id))!;
    expect(categoryChangeIsCounted(reworded, 'personal')).toBe(true);
    await moveTo(reworded, 'personal');
    expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
      from_category: 'health',
      counted_late: true,
    });
    await atTime(tomorrow(), () => usePredictionStore.getState().resolve(p.id, 'resolved_no'));
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  // Kept strict (review round 7): new words after an early move don't reset
  // the category remembered.
  it('counts an early move, then new words, then an answer in the new category, against the remembered one', async () => {
    // Logged two days ago, due in four days. Moved yesterday, reworded today.
    const p = await loggedEarlier(() => create(6), 2);
    await atTime(new Date(Date.now() - DAY).toISOString(), () => moveTo(p, 'personal'));
    const moved = (await usePredictionStore.getState().getById(p.id))!;
    await moveTo(moved, 'personal', 'Knee still hurts by Friday');
    expect(usePredictionStore.getState().categoryOrigins[p.id]?.from_category).toBe('health');
    await atTime(tomorrow(), () => usePredictionStore.getState().resolve(p.id, 'resolved_no'));
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });
});

// Review round 7 (the record auditor's case C and "No double counting"): an
// answer moved back after it was answered to the category it had at the end
// of the day it was logged is never counted again.
describe('an answer moved back to the category it had at the end of the day it was logged', () => {
  const DAY = 86_400_000;
  const create = (dueInDays: number, title = 'Knee is fine by Friday') =>
    usePredictionStore.getState().create({
      title,
      category: 'health',
      confidence: 80,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });
  type Movable = { id: string; title: string; due_date: string };
  const moveTo = (p: Movable, category: 'health' | 'personal' | 'work') =>
    usePredictionStore.getState().update(p.id, { title: p.title, category, due_date: p.due_date });
  const refile = (id: string, category: 'health' | 'personal' | 'work') =>
    usePredictionStore.getState().refile(id, category);
  const counts = async () => {
    await usePredictionStore.getState().loadResolved();
    const s = usePredictionStore.getState();
    return { moved: s.refiledCount, late: s.postponedCount, deleted: s.deletedCount };
  };

  it('case C: moved on the eve (counted late), a No, moved back within the day: counted once', async () => {
    // Logged yesterday, due tomorrow: today is its eve.
    const p = await loggedEarlier(() => create(2));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
    expect((await usePredictionStore.getState().getById(p.id))?.category).toBe('health');
  });

  it('after a late change, a move of the answer to a third category is counted as moved, and comes off back home', async () => {
    const p = await loggedEarlier(() => create(2));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    await refile(p.id, 'work');
    expect(await counts()).toEqual({ moved: 1, late: 1, deleted: 0 });
    // Back where it was answered: off.
    await refile(p.id, 'personal');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
    await refile(p.id, 'work');
    expect(await counts()).toEqual({ moved: 1, late: 1, deleted: 0 });
    // Back to the category it had at the end of the day it was logged: off,
    // though its count started from personal.
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  it('an early move then an eve move, answered, moved back home: counted once, as a late change', async () => {
    // Logged two days ago, due tomorrow. Moved yesterday (remembered), again
    // today, the eve (late).
    const p = await loggedEarlier(() => create(3), 2);
    await atTime(new Date(Date.now() - DAY).toISOString(), () => moveTo(p, 'personal'));
    await moveTo((await usePredictionStore.getState().getById(p.id))!, 'work');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  it('an early move answered away (counted as moved), moved back home: off; then away again: on', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
    await refile(p.id, 'work');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
  });

  it('an answer from another phone moved here: home is not counted, a third category is', async () => {
    const p = await loggedEarlier(() => create(4));
    await moveTo(p, 'personal');
    const here = (await usePredictionStore.getState().getById(p.id))!;
    await upsertPredictionFromRemote({
      ...here,
      status: 'resolved_no',
      resolved_at: new Date(Date.now() - 60_000).toISOString(),
      title_edited_at: null,
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
    await refile(p.id, 'work');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });

  it('with nothing remembered, D65 alone: counted away from where it was answered', async () => {
    const p = await loggedEarlier(() => create(4));
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    await refile(p.id, 'personal');
    expect(await counts()).toEqual({ moved: 1, late: 0, deleted: 0 });
    await refile(p.id, 'health');
    expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
  });
});

// Review round 7 (reproduced by the screens builder): the moved-answers count
// is a function of where the answer ends up, never of the path it took.
describe('the moved-answers count follows where the answer ends up', () => {
  type Cat = 'health' | 'personal' | 'work' | 'finance';
  /**
   * Local wall-clock time `days` from today at `hour` (past 23 rolls into
   * the next day), so no step crosses a midnight by accident.
   */
  const at = (days: number, hour: number): string => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() + days, hour).toISOString();
  };
  const store = () => usePredictionStore.getState();
  /** Logged three days ago at noon in `category`, due today at noon. */
  const logged = (title: string, category: Cat) => {
    // Read on the real clock, before it is set back.
    const due = at(0, 12);
    return atTime(at(-3, 12), () => store().create({ title, category, confidence: 80, due_date: due }));
  };
  /** An open move (Edit) at `iso`. */
  const moveOpen = (id: string, category: Cat, iso: string, title?: string) =>
    atTime(iso, async () => {
      const cur = (await store().getById(id))!;
      await store().update(id, { title: title ?? cur.title, category, due_date: cur.due_date });
    });
  const idsIn = async (table: string, column = 'prediction_id', where = '') =>
    (await getDb().all<{ id: string }>(`SELECT ${column} AS id FROM ${table} ${where}`)).map(
      (r) => r.id,
    );
  const counts = async () => {
    await store().loadResolved();
    const s = store();
    return { moved: s.refiledCount, late: s.postponedCount, deleted: s.deletedCount };
  };

  // Logged in work, moved to personal on the eve (a late change), a No in
  // personal, then within its window back to personal by two routes.
  it.each([
    ['personal → health → personal', ['health', 'personal']],
    ['personal → work → health → personal', ['work', 'health', 'personal']],
  ] as const)("the screens builder's path %s: one late change, no moved answer", async (_name, route) => {
    const p = await logged('Ship the deck', 'work');
    await moveOpen(p.id, 'personal', at(-1, 12));
    await atTime(at(0, 12), () => store().resolve(p.id, 'resolved_no'));
    let hour = 13;
    for (const c of route) await atTime(at(0, hour++), () => store().refile(p.id, c));
    expect((await store().getById(p.id))?.category).toBe('personal');
    expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
  });

  type When = 'logged day' | 'early' | 'eve';
  const WHEN: Record<When, [number, number]> = {
    // The day it was logged (day -3), later that afternoon.
    'logged day': [-3, 14],
    // After that day, two or more days before the due day.
    early: [-2, 12],
    // The day before the due day.
    eve: [-1, 12],
  };
  interface Path {
    name: string;
    from: Cat;
    /** Moves while open, in order (logged-day moves first). */
    open?: [When, Cat][];
    /** New words the early day, an hour after its moves: the answer that day isn't scored. */
    sameDay?: boolean;
    answer?: 'resolved_yes' | 'resolved_no' | 'skipped';
    /** Moves of the answer within its window, in order. */
    after?: Cat[];
    /** Deleted after the last move, within its window. */
    deleted?: boolean;
    /** What Insights shows for it, written out by hand. */
    want: { moved: 0 | 1; late: 0 | 1; deleted?: 0 | 1 };
  }

  /**
   * The answered hint's statement, applied to the path on its own: "Insights
   * counts a scored answer that ends up in a different category from the one
   * it had at the end of the day it was logged. A category change made while
   * it was open, from the day before its due day but not on the day it was
   * logged, is counted once, as a late change." The second sentence keeps
   * the answer off the moved-answers line while it sits where the open moves
   * left it (the late-changes line holds that); a deleted answer is counted
   * once, as a deletion (D65).
   */
  function statement(path: Path): { moved: 0 | 1; late: 0 | 1; deleted: 0 | 1 } {
    let cat = path.from;
    let late = false;
    let endOfLoggedDay = path.from;
    for (const [when, to] of path.open ?? []) {
      if (when === 'eve' && to !== cat) late = true;
      cat = to;
      if (when === 'logged day') endOfLoggedDay = cat;
    }
    const answeredIn = cat;
    const answer = path.answer ?? 'resolved_no';
    const scored = answer !== 'skipped' && !path.sameDay;
    const end = path.after?.length ? path.after[path.after.length - 1] : answeredIn;
    const away = scored && end !== endOfLoggedDay && !(late && end === answeredIn);
    const deleted = path.deleted ? 1 : 0;
    return { moved: away && !path.deleted ? 1 : 0, late: late ? 1 : 0, deleted };
  }

  const PATHS: Path[] = [
    // The record auditor's "no double counting" list and case C.
    { name: 'eve move, answered', from: 'work', open: [['eve', 'personal']], want: { moved: 0, late: 1 } },
    {
      name: 'case C: eve move, answered, moved back home',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['work'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'eve move, answered, personal → health → personal',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['health', 'personal'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'eve move, answered, personal → work → health → personal',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['work', 'health', 'personal'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'the same with a Yes',
      from: 'work',
      open: [['eve', 'personal']],
      answer: 'resolved_yes',
      after: ['work', 'health', 'personal'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'eve move, answered, moved to a third category',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['health'],
      want: { moved: 1, late: 1 },
    },
    {
      name: 'eve move, answered, third category, then home',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['health', 'work'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'eve move, answered, home, then a third category',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['work', 'health'],
      want: { moved: 1, late: 1 },
    },
    {
      name: 'eve move and back the same day, answered home, then moved',
      from: 'work',
      open: [
        ['eve', 'personal'],
        ['eve', 'work'],
      ],
      after: ['personal'],
      want: { moved: 1, late: 1 },
    },
    {
      name: 'early move then eve move, answered',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['eve', 'health'],
      ],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'early move then eve move, answered, moved home',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['eve', 'health'],
      ],
      after: ['work'],
      want: { moved: 0, late: 1 },
    },
    {
      name: 'early move then eve move, answered, moved to where the early move put it',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['eve', 'health'],
      ],
      after: ['personal'],
      want: { moved: 1, late: 1 },
    },
    {
      name: 'early move then eve move, answered, there and back',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['eve', 'health'],
      ],
      after: ['personal', 'health'],
      want: { moved: 0, late: 1 },
    },
    // Round 6: an early move, then an answer elsewhere, is counted.
    { name: 'early move, answered away', from: 'work', open: [['early', 'personal']], want: { moved: 1, late: 0 } },
    {
      name: 'early move, answered away, moved home',
      from: 'work',
      open: [['early', 'personal']],
      after: ['work'],
      want: { moved: 0, late: 0 },
    },
    {
      name: 'early move, answered away, home, then away again',
      from: 'work',
      open: [['early', 'personal']],
      after: ['work', 'health'],
      want: { moved: 1, late: 0 },
    },
    {
      name: 'early move, answered away, home, then back where it was answered',
      from: 'work',
      open: [['early', 'personal']],
      after: ['work', 'personal'],
      want: { moved: 1, late: 0 },
    },
    {
      name: 'early move and back before the answer',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['early', 'work'],
      ],
      want: { moved: 0, late: 0 },
    },
    {
      name: 'early move and back, answered home, moved and back',
      from: 'work',
      open: [
        ['early', 'personal'],
        ['early', 'work'],
      ],
      after: ['health', 'personal', 'work'],
      want: { moved: 0, late: 0 },
    },
    // D65 alone: nothing moved it after the day it was logged.
    { name: 'never moved, answered', from: 'work', want: { moved: 0, late: 0 } },
    { name: 'never moved, answer moved', from: 'work', after: ['personal'], want: { moved: 1, late: 0 } },
    {
      name: 'never moved, answer moved twice',
      from: 'work',
      after: ['personal', 'health'],
      want: { moved: 1, late: 0 },
    },
    {
      name: 'never moved, answer moved away and back by a long way',
      from: 'work',
      after: ['personal', 'health', 'finance', 'work'],
      want: { moved: 0, late: 0 },
    },
    // A move the day it was logged is a slip fixed: that day's end is after it.
    {
      name: 'logged-day move, answered',
      from: 'work',
      open: [['logged day', 'personal']],
      want: { moved: 0, late: 0 },
    },
    {
      name: 'logged-day move, answer moved back to where it was logged',
      from: 'work',
      open: [['logged day', 'personal']],
      after: ['work'],
      want: { moved: 1, late: 0 },
    },
    {
      name: 'logged-day move, then an early move, answered away',
      from: 'work',
      open: [
        ['logged day', 'personal'],
        ['early', 'health'],
      ],
      want: { moved: 1, late: 0 },
    },
    {
      name: 'logged-day move, then an early move, answer moved to that day’s end',
      from: 'work',
      open: [
        ['logged day', 'personal'],
        ['early', 'health'],
      ],
      after: ['personal'],
      want: { moved: 0, late: 0 },
    },
    // Only a scored answer.
    {
      name: 'early move, Can’t tell',
      from: 'work',
      open: [['early', 'personal']],
      answer: 'skipped',
      want: { moved: 0, late: 0 },
    },
    {
      name: 'early move, new words, answered the same day, then moved',
      from: 'work',
      open: [['early', 'personal']],
      sameDay: true,
      after: ['health'],
      want: { moved: 0, late: 0 },
    },
    // Deleted after a move: counted once, as a deletion (D65).
    {
      name: 'early move, answered away, moved, deleted',
      from: 'work',
      open: [['early', 'personal']],
      after: ['health'],
      deleted: true,
      want: { moved: 0, late: 0, deleted: 1 },
    },
    {
      name: 'eve move, answered, third category, deleted',
      from: 'work',
      open: [['eve', 'personal']],
      after: ['health'],
      deleted: true,
      want: { moved: 0, late: 1, deleted: 1 },
    },
  ];

  it('every path: the statement and the hand-written count agree', () => {
    for (const path of PATHS) {
      expect({ name: path.name, ...statement(path) }).toEqual({
        name: path.name,
        deleted: 0,
        ...path.want,
      });
    }
  });

  it('every path: what Insights counts is what the statement says', async () => {
    const want = { moved: 0, late: 0, deleted: 0 };
    for (const path of PATHS) {
      const p = await logged(path.name, path.from);
      // The timeline the WHEN table assumes: logged day -3, due day 0.
      expect(p.due_date).toBe(at(0, 12));
      for (const [when, to] of path.open ?? []) {
        const [day, hour] = WHEN[when];
        await moveOpen(p.id, to, at(day, hour));
      }
      // Answered on the due day, or with new words the early day, that day.
      let [day, hour] = [0, 12];
      if (path.sameDay) {
        const cur = (await store().getById(p.id))!;
        await moveOpen(p.id, cur.category as Cat, at(-2, 13), `${path.name}, reworded`);
        [day, hour] = [-2, 18];
      }
      await atTime(at(day, hour), () => store().resolve(p.id, path.answer ?? 'resolved_no'));
      for (const c of path.after ?? []) {
        hour += 1;
        await atTime(at(day, hour), () => store().refile(p.id, c));
      }
      if (path.deleted) await atTime(at(day, hour + 1), () => store().remove(p.id));

      const got = {
        name: path.name,
        moved: (await idsIn('prediction_refiles')).includes(p.id) ? 1 : 0,
        late: (await idsIn('prediction_postponements')).includes(p.id) ? 1 : 0,
        deleted: (await idsIn('prediction_deletions', 'id', 'WHERE counted = 1')).includes(p.id) ? 1 : 0,
      };
      const said = statement(path);
      expect(got).toEqual({ name: path.name, ...said });
      want.moved += said.moved;
      want.late += said.late;
      want.deleted += said.deleted;
    }
    // Insights' lines are the sums, each prediction once per line.
    expect(await counts()).toEqual(want);
  });
});

// Owner decision 2026-11-19 (review round 7): an open prediction deleted on
// any day after the day it was logged is counted; a rewording doesn't move
// that day.
describe('which deletes are counted', () => {
  const DAY = 86_400_000;
  const create = (title: string, dueInDays: number) =>
    usePredictionStore.getState().create({
      title,
      category: 'work',
      confidence: 70,
      due_date: new Date(Date.now() + dueInDays * DAY).toISOString(),
    });
  const deleted = async () => {
    await usePredictionStore.getState().loadResolved();
    return usePredictionStore.getState().deletedCount;
  };

  it('counts an open one deleted the day after it was logged, however far off its due day', async () => {
    const p = await loggedEarlier(() => create('Far off', 30));
    await usePredictionStore.getState().remove(p.id);
    expect(await deleted()).toBe(1);
  });

  it("doesn't count one deleted the day it was logged, new words or not", async () => {
    const p = await create('Fresh one', 30);
    await usePredictionStore.getState().update(p.id, {
      title: 'Fresh words entirely',
      category: 'work',
      due_date: p.due_date,
    });
    await usePredictionStore.getState().remove(p.id);
    expect(await deleted()).toBe(0);
  });

  it('counts one logged earlier and reworded today', async () => {
    const p = await loggedEarlier(() => create('Old words', 30));
    await usePredictionStore.getState().update(p.id, {
      title: 'New words entirely',
      category: 'work',
      due_date: p.due_date,
    });
    await usePredictionStore.getState().remove(p.id);
    expect(await deleted()).toBe(1);
  });

  // Review round 7: the tombstone records what the person saw, so an answer
  // that reached this phone after the screen was drawn comes back.
  it('records in the tombstone the copy the screen showed, so an answer pulled since comes back', async () => {
    const userId = useAuthStore.getState().userId!;
    const p = await loggedEarlier(() => create('Seen open', 30));
    const shown = (await usePredictionStore.getState().getById(p.id))!;
    const answer = {
      ...shown,
      status: 'resolved_no' as const,
      resolved_at: new Date(Date.now() - 60_000).toISOString(),
      title_edited_at: null,
      updated_at: '2099-01-01T00:00:00.000Z',
    };
    await upsertPredictionFromRemote(answer);
    await usePredictionStore.getState().remove(p.id, shown);
    expect(await listPendingTombstonesSettled(userId)).toEqual([
      expect.objectContaining({ id: p.id, deleted_status: 'pending', deleted_resolved_at: null }),
    ]);
    expect(await reconcileTombstoneWithRemote(answer)).toBe('restored');
    expect((await getPrediction(p.id))?.status).toBe('resolved_no');
    expect(await deleted()).toBe(0);
  });

  it('records the copy it checked when the screen states none', async () => {
    const userId = useAuthStore.getState().userId!;
    const p = await loggedEarlier(() => create('Answered one', 30));
    await usePredictionStore.getState().resolve(p.id, 'resolved_no');
    const answered = (await usePredictionStore.getState().getById(p.id))!;
    await usePredictionStore.getState().remove(p.id);
    expect(await listPendingTombstonesSettled(userId)).toEqual([
      expect.objectContaining({
        id: p.id,
        deleted_status: 'resolved_no',
        deleted_resolved_at: answered.resolved_at,
      }),
    ]);
  });

  // The owner's list item 20 (2026-11-19): a Can't tell is counted exactly as
  // an open one is. Until then, tapping Can't tell first let any delete leave
  // no trace, and the delete took it off Insights' Can't tell count too.
  describe("a Can't tell", () => {
    const skip = (id: string) => usePredictionStore.getState().resolve(id, 'skipped');
    const skipCount = async () => {
      await usePredictionStore.getState().loadResolved();
      return usePredictionStore.getState().resolved.filter((p) => p.status === 'skipped').length;
    };
    const counts = async () => {
      await usePredictionStore.getState().loadResolved();
      const s = usePredictionStore.getState();
      return { moved: s.refiledCount, late: s.postponedCount, deleted: s.deletedCount };
    };

    it('counts one deleted after the day it was logged, however old the skip, exactly once', async () => {
      const userId = useAuthStore.getState().userId!;
      // Logged and skipped a month ago, due the next day: long past its week.
      const p = await loggedEarlier(async () => {
        const made = await create('Parked a month ago', 1);
        await skip(made.id);
        return made;
      }, 30);
      const shown = (await usePredictionStore.getState().getById(p.id))!;
      expect(shown.status).toBe('skipped');
      expect(skipAnswerBy(shown)).toBeNull();
      expect(await skipCount()).toBe(1);
      expect(await deleted()).toBe(0);
      // What a push would have sent: the server holds this Can't tell.
      const onServer = (await listDirtyPredictions(userId)).find((r) => r.id === p.id)!;
      expect(onServer).toMatchObject({ status: 'skipped', resolved_at: shown.resolved_at });

      await usePredictionStore.getState().remove(p.id, shown);
      expect(await deleted()).toBe(1);
      expect(await skipCount()).toBe(0);
      expect(await listDeletions(userId)).toEqual([
        expect.objectContaining({ id: p.id, counted: true }),
      ]);
      // Sync treats it as any deleted answer: the tombstone records the Can't
      // tell it deleted, so the server's copy is covered and removed, and the
      // pull keeps the tombstone, still counted once.
      const [tomb] = await listPendingTombstonesSettled(userId);
      expect(tomb).toMatchObject({
        id: p.id,
        deleted_status: 'skipped',
        deleted_resolved_at: shown.resolved_at,
      });
      expect(tombstoneCovers(tomb, onServer)).toBe(true);
      expect(await reconcileTombstoneWithRemote(onServer)).toBe('kept');
      expect(await deleted()).toBe(1);
    });

    it("doesn't count one skipped and deleted the day it was logged, before it is due", async () => {
      const userId = useAuthStore.getState().userId!;
      // Answer it now, Can't tell, then delete, all on the day it was logged.
      const p = await create('Skipped the day it was logged', 30);
      await skip(p.id);
      await usePredictionStore.getState().remove(p.id);
      expect(await deleted()).toBe(0);
      expect(await listDeletions(userId)).toEqual([
        expect.objectContaining({ id: p.id, counted: false }),
      ]);
    });

    it('counts one deleted the day it was logged once it is due', async () => {
      const userId = useAuthStore.getState().userId!;
      const now = new Date().toISOString();
      await insertPrediction({
        id: 'due-skip',
        user_id: userId,
        title: 'Due today, skipped',
        category: 'work',
        confidence: 70,
        created_at: now,
        due_date: now,
        status: 'skipped',
        resolved_at: now,
        reflection: null,
        integrity_bonus: false,
      });
      await usePredictionStore.getState().remove('due-skip');
      expect(await deleted()).toBe(1);
    });

    it('counts one logged earlier, reworded today and then skipped: new words do not move that day', async () => {
      const p = await loggedEarlier(() => create('Old words', 30));
      await usePredictionStore.getState().update(p.id, {
        title: 'New words entirely',
        category: 'work',
        due_date: p.due_date,
      });
      await skip(p.id);
      await usePredictionStore.getState().remove(p.id);
      expect(await deleted()).toBe(1);
    });

    // Never twice for one prediction: as for an open one, a late due-date
    // move stays on the late-changes line (it outlives the delete) and the
    // delete adds one deletion. The Can't tell between them adds nothing.
    it.each([
      ['left open', false],
      ["marked Can't tell", true],
    ])('counts a late move then a delete once on each line, %s', async (_label, skipped) => {
      // Logged two days ago, due today: moving it later is counted.
      const p = await loggedEarlier(() => create('Moved, then dropped', 2), 2);
      await usePredictionStore.getState().update(p.id, {
        title: p.title,
        category: 'work',
        due_date: new Date(Date.now() + 5 * DAY).toISOString(),
      });
      expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 0 });
      if (skipped) await skip(p.id);
      await usePredictionStore.getState().remove(p.id);
      expect(await counts()).toEqual({ moved: 0, late: 1, deleted: 1 });
    });

    // A category moved early is remembered (round 6), but a Can't tell is
    // never on the moved-answers line; deleted, it is counted once, as a
    // deletion, and its remembered category goes with it.
    it('counts an early category move, Can’t tell, then a delete once, as a deletion', async () => {
      const userId = useAuthStore.getState().userId!;
      const p = await loggedEarlier(() => create('Moved early', 5));
      await usePredictionStore.getState().update(p.id, {
        title: p.title,
        category: 'health',
        due_date: p.due_date,
      });
      expect(usePredictionStore.getState().categoryOrigins[p.id]).toMatchObject({
        from_category: 'work',
        counted_late: false,
      });
      await skip(p.id);
      expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 0 });
      await usePredictionStore.getState().remove(p.id);
      expect(await counts()).toEqual({ moved: 0, late: 0, deleted: 1 });
      expect(await listCategoryOrigins(userId)).toEqual([]);
    });
  });

  it('records the open copy "Use another number" replaced', async () => {
    const userId = useAuthStore.getState().userId!;
    const p = await create('Another number', 30);
    await usePredictionStore.getState().renumber(p.id, {
      title: p.title,
      category: 'work',
      confidence: 40,
      due_date: p.due_date,
    });
    expect(await listPendingTombstonesSettled(userId)).toEqual([
      expect.objectContaining({ id: p.id, deleted_status: 'pending', deleted_resolved_at: null }),
    ]);
    expect(await deleted()).toBe(0);
  });

  // 2026-11-19, re-review of round 7 (SQLite migration 023; the record
  // auditor's cases 3 and 4): an answer that reached the server, changed
  // here, then deleted before the next sync. The tombstone keeps the version
  // last pushed too, so the server's copy is covered and the delete stays
  // counted, instead of the old answer coming back.
  describe('an answer pushed, changed here, then deleted', () => {
    /** What a push sends, marked as sync marks it; the server's copies by id. */
    async function pushAll(userId: string) {
      const rows = await listDirtyPredictions(userId);
      for (const row of rows) await markPredictionSynced(row.id, row.updated_at);
      return new Map(rows.map((row) => [row.id, row]));
    }

    it('after Change answer, the Yes the server holds is covered', async () => {
      const userId = useAuthStore.getState().userId!;
      const p = await loggedEarlier(() => create('Pushed, then switched', 30));
      await usePredictionStore.getState().resolve(p.id, 'resolved_yes');
      const onServer = (await pushAll(userId)).get(p.id)!;
      expect(onServer).toMatchObject({ status: 'resolved_yes' });

      await usePredictionStore.getState().correct(p.id, 'resolved_no');
      const shown = (await usePredictionStore.getState().getById(p.id))!;
      expect(shown).toMatchObject({ status: 'resolved_no', resolved_at: onServer.resolved_at });
      await usePredictionStore.getState().remove(p.id, shown);

      const [tomb] = await listPendingTombstonesSettled(userId);
      expect(tomb).toMatchObject({
        deleted_status: 'resolved_no',
        synced_status: 'resolved_yes',
        synced_resolved_at: onServer.resolved_at,
      });
      expect(tombstoneCovers(tomb, onServer)).toBe(true);
      expect(await reconcileTombstoneWithRemote(onServer)).toBe('kept');
      expect(await getPrediction(p.id)).toBeNull();
      expect(await deleted()).toBe(1);
    });

    it("after a pushed Can't tell is answered here, the Can't tell the server holds is covered", async () => {
      const userId = useAuthStore.getState().userId!;
      const p = await loggedEarlier(() => create('Pushed skip', 1), 2);
      await usePredictionStore.getState().resolve(p.id, 'skipped');
      const onServer = (await pushAll(userId)).get(p.id)!;
      expect(onServer).toMatchObject({ status: 'skipped' });

      await usePredictionStore
        .getState()
        .resolve(p.id, 'resolved_no', undefined, { answeringSkip: true });
      expect((await getPrediction(p.id))?.status).toBe('resolved_no');
      await usePredictionStore.getState().remove(p.id);

      const [tomb] = await listPendingTombstonesSettled(userId);
      expect(tomb).toMatchObject({
        deleted_status: 'resolved_no',
        synced_status: 'skipped',
        synced_resolved_at: onServer.resolved_at,
      });
      expect(await reconcileTombstoneWithRemote(onServer)).toBe('kept');
      expect(await getPrediction(p.id)).toBeNull();
      expect(await deleted()).toBe(1);
    });
  });
});

// Review 2026-11-19 (privacy): a key of the Coach's support card set aside is
// a prediction's id and a hash of its title and note, and that it exists says
// the crisis filter matched them, so none outlives the words it was made from.
describe('support card set-asides follow the words', () => {
  let saves: Array<string[] | undefined>;

  beforeEach(async () => {
    saves = [];
    __setPersistenceForTests({
      load: async () => null,
      save: async (s) => {
        saves.push(s.supportAsideKeys);
      },
    });
    await useSettingsStore.getState().hydrate();
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  const store = () => usePredictionStore.getState();
  const keys = () => useSettingsStore.getState().supportAsideKeys;
  const setAside = async (...ps: Prediction[]) => {
    await useSettingsStore.getState().addSupportAsideKeys(ps.map((p) => supportAsideKey(p)));
    saves = [];
  };

  /** An answered prediction, logged yesterday, with this note. */
  const answered = async (title: string, reflection?: string): Promise<Prediction> => {
    const p = await loggedEarlier(() =>
      store().create({ title, category: 'work', confidence: 70, due_date: '2099-06-01T12:00:00.000Z' }),
    );
    await store().resolve(p.id, 'resolved_no', reflection);
    return (await store().getById(p.id))!;
  };

  it('"Remove note" drops the key for the words before, and leaves every other', async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    const b = await answered('Other', 'another note');
    await setAside(a, b);

    await store().reflect(a.id, '');

    expect(keys()).toEqual([supportAsideKey(b)]);
    expect(saves).toEqual([[supportAsideKey(b)]]);
  });

  it('"Change note" drops it too; the same words keep it, writing nothing', async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    await setAside(a);

    await store().reflect(a.id, '  he hits me when he drinks  ');
    expect(keys()).toEqual([supportAsideKey(a)]);
    expect(saves).toEqual([]);

    await store().reflect(a.id, 'a calm one now');
    expect(keys()).toEqual([]);
  });

  it('a delete drops the key', async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    const b = await answered('Other');
    await setAside(a, b);

    await store().remove(a.id);

    expect(keys()).toEqual([supportAsideKey(b)]);
  });

  it('new words drop a key kept for the old ones', async () => {
    const p = await store().create({
      title: 'Ship it',
      category: 'work',
      confidence: 70,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await setAside(p);

    await store().update(p.id, { title: 'Ship it on Friday', category: 'work', due_date: p.due_date });

    expect(keys()).toEqual([]);
  });

  it('an edit that leaves the words as they were keeps the key, writing nothing', async () => {
    const p = await store().create({
      title: 'Ship it',
      category: 'work',
      confidence: 70,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await setAside(p);

    await store().update(p.id, { title: 'Ship it', category: 'health', due_date: p.due_date });

    expect(keys()).toEqual([supportAsideKey(p)]);
    expect(saves).toEqual([]);
  });

  it('"Use another number" drops the key of the one it replaces', async () => {
    const p = await store().create({
      title: 'Rain by Friday',
      category: 'work',
      confidence: 60,
      due_date: '2099-06-01T12:00:00.000Z',
    });
    await setAside(p);

    const next = await store().renumber(p.id, {
      title: p.title,
      category: 'work',
      confidence: 80,
      due_date: p.due_date,
    });

    expect(next.id).not.toBe(p.id);
    expect(keys()).toEqual([]);
  });

  it("answering a Can't tell with a new note drops the key for its words before", async () => {
    const p = await loggedEarlier(
      () =>
        store().create({
          title: 'Hard to say',
          category: 'work',
          confidence: 60,
          due_date: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      2,
    );
    await store().resolve(p.id, 'skipped', 'I cannot go on like this');
    await setAside((await store().getById(p.id))!);

    await store().resolve(p.id, 'resolved_yes', 'It came out fine', { answeringSkip: true });

    expect((await store().getById(p.id))?.reflection).toBe('It came out fine');
    expect(keys()).toEqual([]);
  });

  it('with no key for the prediction, nothing is written', async () => {
    const a = await answered('Quiet weekend');
    const b = await answered('Other');
    await setAside(b);

    await store().reflect(a.id, 'a note');
    await store().remove(a.id);

    expect(keys()).toEqual([supportAsideKey(b)]);
    expect(saves).toEqual([]);
  });

  it('a settings failure never fails the change the person made', async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    await setAside(a);
    const real = useSettingsStore.getState().retainSupportAsideKeys;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    useSettingsStore.setState({
      retainSupportAsideKeys: async () => {
        throw new Error('settings gone');
      },
    });
    try {
      await expect(store().reflect(a.id, '')).resolves.toBeUndefined();
    } finally {
      useSettingsStore.setState({ retainSupportAsideKeys: real });
      warn.mockRestore();
    }
    expect((await store().getById(a.id))?.reflection).toBeNull();
  });

  it("a prediction that can't be read back loses every key it had (the card comes back)", async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    const b = await answered('Other');
    await setAside(a, b);
    const db = getDb();
    const realGet = db.get.bind(db);
    const realRun = db.run.bind(db);
    // The read straight after the note's write fails; the write has landed.
    let failNextRead = false;
    db.run = async (sql, params) => {
      const out = await realRun(sql, params);
      if (/SET reflection = \?/.test(sql)) failNextRead = true;
      return out;
    };
    db.get = (async (sql: string, params?: unknown[]) => {
      if (failNextRead) {
        failNextRead = false;
        throw new Error('read failed');
      }
      return realGet(sql, params as never);
    }) as typeof db.get;
    try {
      // The same words: only the failed read takes its key.
      await store().reflect(a.id, 'he hits me when he drinks');
    } finally {
      db.get = realGet;
      db.run = realRun;
    }
    expect(keys()).toEqual([supportAsideKey(b)]);
  });

  // Re-review round two, 2026-11-19 (item 6): the read-back takes its turn in
  // the transaction queue, so it never sees a sync's rows before they commit.
  it('reads the words back only once a transaction queued before it has settled', async () => {
    const a = await answered('Quiet weekend', 'he hits me when he drinks');
    await setAside(a);
    const real = useSettingsStore.getState().retainSupportAsideKeys;
    let retains = 0;
    useSettingsStore.setState({
      retainSupportAsideKeys: async (keep) => {
        retains += 1;
        return real(keep);
      },
    });
    const settle = () => new Promise((r) => setImmediate(r));
    let release: () => void = () => {};
    try {
      // A sync's transaction, still open.
      const held = withTransaction(() => new Promise<void>((r) => (release = r)));
      const reflecting = store().reflect(a.id, 'a calm one now');
      await settle();
      await settle();
      expect(retains).toBe(0);

      release();
      await held;
      await reflecting;
    } finally {
      useSettingsStore.setState({ retainSupportAsideKeys: real });
    }
    expect(retains).toBeGreaterThan(0);
    expect(keys()).toEqual([]);
  });

  // Re-review round two, 2026-11-19 (item 3): a note changed or a prediction
  // deleted on another phone arrives by a sync pull, which runs none of the
  // hooks above; the reload after it drops their keys.
  describe('a reload of the answered list', () => {
    /** As a sync pull writes them: straight into the database, no store hook. */
    const pullNote = (id: string, reflection: string | null) =>
      getDb().run(`UPDATE predictions SET reflection = ? WHERE id = ?`, [reflection, id]);
    const pullDelete = (id: string) => getDb().run(`DELETE FROM predictions WHERE id = ?`, [id]);

    it('drops the keys of a note changed and a prediction deleted elsewhere, in one write', async () => {
      const a = await answered('Quiet weekend', 'he hits me when he drinks');
      const b = await answered('Other', 'I cannot go on like this');
      const c = await answered('Third', 'I want to die');
      await setAside(a, b, c);
      await pullNote(a.id, 'a calm note');
      await pullDelete(b.id);

      await store().loadResolved();

      expect(keys()).toEqual([supportAsideKey(c)]);
      expect(saves).toEqual([[supportAsideKey(c)]]);
    });

    it('keeps every key whose words are in the list, writing nothing', async () => {
      const a = await answered('Quiet weekend', 'he hits me when he drinks');
      await setAside(a);

      await store().loadResolved();

      expect(keys()).toEqual([supportAsideKey(a)]);
      expect(saves).toEqual([]);
    });

    it('an empty list that was read drops every key', async () => {
      const a = await answered('Quiet weekend', 'he hits me when he drinks');
      await setAside(a);
      await pullDelete(a.id);

      await store().loadResolved();

      expect(store().resolved).toEqual([]);
      expect(keys()).toEqual([]);
    });

    it('a read that fails drops nothing', async () => {
      const a = await answered('Quiet weekend', 'he hits me when he drinks');
      await setAside(a);
      await pullNote(a.id, null);
      const db = getDb();
      const realAll = db.all.bind(db);
      db.all = (async () => {
        throw new Error('read failed');
      }) as typeof db.all;
      try {
        await expect(store().loadResolved()).rejects.toThrow('read failed');
      } finally {
        db.all = realAll;
      }
      expect(keys()).toEqual([supportAsideKey(a)]);
    });

    it('a list read for an account the app has left meanwhile keeps and drops nothing', async () => {
      const a = await answered('Quiet weekend', 'he hits me when he drinks');
      const b = await answered('Other', 'I cannot go on like this');
      await setAside(a, b);
      await pullDelete(b.id);
      const db = getDb();
      const realAll = db.all.bind(db);
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => (release = r));
      db.all = (async (sql: string, params?: unknown[]) => {
        await gate;
        return realAll(sql, params as never);
      }) as typeof db.all;
      try {
        const loading = store().loadResolved();
        useAuthStore.setState({ userId: 'another-account' });
        release();
        await loading;
      } finally {
        db.all = realAll;
      }
      expect(keys()).toEqual([supportAsideKey(a), supportAsideKey(b)]);
      expect(saves).toEqual([]);
    });

    // Review round three, 2026-11-19: nearly always nothing is set aside, and
    // a reload then has nothing to drop, so it hashes no words.
    describe('with nothing set aside', () => {
      /** `p` as the list read gives it, its title and note counting their reads. */
      const watched = (p: Prediction) => {
        let reads = 0;
        const row = { ...p };
        for (const field of ['title', 'reflection'] as const) {
          const value = p[field];
          Object.defineProperty(row, field, {
            enumerable: true,
            get: () => {
              reads += 1;
              return value;
            },
          });
        }
        return { row, reads: () => reads };
      };

      /** Count the retains asked of the settings store, which still run. */
      const countRetains = () => {
        const real = useSettingsStore.getState().retainSupportAsideKeys;
        let retains = 0;
        useSettingsStore.setState({
          retainSupportAsideKeys: async (keep) => {
            retains += 1;
            return real(keep);
          },
        });
        return { count: () => retains, restore: () => useSettingsStore.setState({ retainSupportAsideKeys: real }) };
      };

      it('and the settings read, a reload reads no word and asks nothing of the settings', async () => {
        const a = await answered('Quiet weekend', 'he hits me when he drinks');
        const b = await answered('Other', 'I cannot go on like this');
        const w = watched(a);
        const list = jest.spyOn(predictionsDb, 'listResolvedPredictions').mockResolvedValue([w.row]);
        const retains = countRetains();
        try {
          await store().loadResolved();
          expect(w.reads()).toBe(0);
          expect(retains.count()).toBe(0);
          expect(saves).toEqual([]);

          // With a key stored (b's, not in the list), the same reload reads
          // the words and drops it.
          await setAside(b);
          await store().loadResolved();
          expect(w.reads()).toBeGreaterThan(0);
          expect(retains.count()).toBe(1);
          expect(keys()).toEqual([]);
        } finally {
          retains.restore();
          list.mockRestore();
        }
      });

      it('but the settings record unreadable, every reload still retains, one held, and a stale key goes once it reads', async () => {
        const a = await answered('Quiet weekend', 'he hits me when he drinks');
        const gone = supportAsideKey({ id: 'gone', title: 'Deleted elsewhere', reflection: 'I want to die' });
        let readable = false;
        let stored: Partial<StoredSettings> = { supportAsideKeys: [supportAsideKey(a), gone] };
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        __setPersistenceForTests({
          load: async () => {
            if (!readable) throw new Error('read failed');
            return stored;
          },
          save: async (s) => {
            stored = { ...s };
          },
        });
        try {
          await useSettingsStore.getState().hydrate();
          expect(useSettingsStore.getState()).toMatchObject({ loadFailed: true, supportAsideKeys: [] });

          for (let n = 0; n < 5; n += 1) await store().loadResolved();
          expect(__heldChangesForTests()).toEqual({ total: 1, retains: 1 });

          readable = true;
          await useSettingsStore.getState().retryLoad();
        } finally {
          warn.mockRestore();
        }
        expect(keys()).toEqual([supportAsideKey(a)]);
        expect(stored.supportAsideKeys).toEqual([supportAsideKey(a)]);
      });
    });
  });
});

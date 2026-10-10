import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction } from '@/db/predictions';
import { getUserStat } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useRatingStore } from '@/store/ratingStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { bucketLine, firstAnswerLine, ResolvePrompt } from './ResolvePrompt';

const USER = 'local-user-v1';

const samplePending = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: USER,
  title: 'Ship the prototype',
  category: 'work',
  confidence: 80,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null });
  useRatingStore.setState({ moment: false });
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

describe('ResolvePrompt', () => {
  it('resolves a prediction Yes with reflection, persists, and triggers stats recompute', async () => {
    await insertPrediction(samplePending());

    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);

    // Wait for the load to finish — the title only renders after getPrediction resolves.
    await waitFor(() => {
      expect(screen.getByText('Ship the prototype')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));

    // The reflection comes after the answer, on the acknowledgement step.
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(onResolved).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'shipped on time');
    fireEvent.press(screen.getByTestId('resolve-done'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });

    const updated = await getPrediction('p1');
    expect(updated?.status).toBe('resolved_yes');
    expect(updated?.reflection).toBe('shipped on time');

    const userStat = await getUserStat(USER);
    expect(userStat?.total_resolved).toBe(1);
    expect(userStat?.calibration_rating).toBeGreaterThan(0);
  });

  // DESIGN_SYSTEM rule 0.4: Yes and No look identical; No is never red.
  it('styles Yes and No identically', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(flat('resolve-no')).toEqual(flat('resolve-yes'));
  });

  it('shows "not found" when the prediction id is unknown', async () => {
    render(<ResolvePrompt predictionId="missing" />);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });

  it('refuses to render a prediction owned by a different user (deep-link safety)', async () => {
    await insertPrediction(samplePending({ user_id: 'someone-else' }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });

  it('shows "already resolved" if the prediction is no longer pending', async () => {
    await insertPrediction(samplePending({ status: 'resolved_yes' }));
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/already resolved/i)).toBeTruthy();
    });
  });
});

describe('ResolvePrompt layout', () => {
  // Hindsight bias: the stated number is read before the outcome is asked for.
  it('leads with what the user said, then asks the question', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);

    await waitFor(() => {
      expect(screen.getByTestId('resolve-stated')).toBeTruthy();
    });
    expect(screen.getByTestId('resolve-stated')).toHaveTextContent(/you said 80%/);
    expect(screen.getByText('Did it happen?')).toBeTruthy();
  });
});

describe('ResolvePrompt acknowledgement', () => {
  it('teaches what the number means on the first answer ever, Yes or No alike', async () => {
    for (const choice of ['resolve-no', 'resolve-yes']) {
      setDbForTests(await createTestDb());
      usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null });
      useStatsStore.setState({ userStat: null, categoryStats: [], calibration: { rating: 0, buckets: [] } });
      await insertPrediction(samplePending());
      const view = render(<ResolvePrompt predictionId="p1" />);
      await waitFor(() => {
        expect(screen.getByTestId(choice)).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId(choice));

      await waitFor(() => {
        expect(screen.getByTestId('resolve-bucket-line')).toBeTruthy();
      });
      expect(screen.getByText(holdRanges(firstAnswerLine(80)))).toBeTruthy();
      view.unmount();
    }
  });

  it('states the bucket in counts from the second answer on', async () => {
    await insertPrediction(samplePending({ id: 'p0', status: 'resolved_yes', resolved_at: '2026-06-01T00:00:00.000Z', confidence: 40 }));
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-bucket-line')).toBeTruthy();
    });
    expect(screen.getByText(holdRanges("That's your first call in the 80–100% range."))).toBeTruthy();
  });

  it('finishes without a reflection, leaving it empty', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-done')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-done'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    expect((await getPrediction('p1'))?.reflection).toBeNull();
  });

  it('skips straight through, with no acknowledgement step', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-skip')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-skip'));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('resolve-recorded')).toBeNull();
  });

  // D10: Skip says what it is and what it costs, so it isn't a free "No".
  it('labels Skip as not counting toward the score', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Can't tell / doesn't apply")).toBeTruthy();
    });
    expect(screen.getByText("It won't count toward your score.")).toBeTruthy();
  });
});

describe('ResolvePrompt — Log it again (roadmap step 22)', () => {
  it('is offered after an answer when the screen supports it, and saves the reflection first', async () => {
    await insertPrediction(samplePending());
    const onPredictAgain = jest.fn();
    render(<ResolvePrompt predictionId="p1" onPredictAgain={onPredictAgain} />);
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    // Not before the answer: the question comes first.
    expect(screen.queryByTestId('resolve-again')).toBeNull();

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-again')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'easier than it looked');
    fireEvent.press(screen.getByTestId('resolve-again'));

    await waitFor(() => expect(onPredictAgain).toHaveBeenCalledTimes(1));
    expect(onPredictAgain.mock.calls[0][0]).toMatchObject({ id: 'p1', title: 'Ship the prototype' });
    expect((await getPrediction('p1'))?.reflection).toBe('easier than it looked');
  });

  it('is not offered without a handler (as inside a run)', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-no')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => expect(screen.getByTestId('resolve-recorded')).toBeTruthy());
    expect(screen.queryByTestId('resolve-again')).toBeNull();
  });
});

// Roadmap step 39: a skip never counted, so it can be taken back.
describe('ResolvePrompt — answering a skipped prediction later', () => {
  it('offers to answer it, and then it counts like any other', async () => {
    await insertPrediction(
      samplePending({ status: 'skipped', resolved_at: '2026-05-20T00:00:00.000Z' }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByTestId('resolve-skipped')).toBeTruthy());

    fireEvent.press(screen.getByTestId('resolve-unskip'));
    await waitFor(() => expect(screen.getByTestId('resolve-yes')).toBeTruthy());
    expect((await getPrediction('p1'))?.status).toBe('pending');

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => expect(screen.getByTestId('resolve-recorded')).toBeTruthy());
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
  });

  it('still refuses to reopen a Yes or No from here', async () => {
    await insertPrediction(
      samplePending({ status: 'resolved_no', resolved_at: '2026-05-20T00:00:00.000Z' }),
    );
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => expect(screen.getByText('Already resolved')).toBeTruthy());
    expect(screen.queryByTestId('resolve-unskip')).toBeNull();
  });
});

describe('bucketLine', () => {
  it('counts what has happened in the range', () => {
    expect(
      bucketLine({
        low: 60,
        high: 80,
        total_resolved: 9,
        resolved_yes: 6,
        stated_confidence_mean: 70,
        actual_rate: 6 / 9,
        bucket_error: 0.03,
        direction: 'calibrated',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe('In your 60–80% range, 6 of 9 have happened.');
  });

  it('agrees with a single one that happened', () => {
    expect(
      bucketLine({
        low: 60,
        high: 80,
        total_resolved: 2,
        resolved_yes: 1,
        stated_confidence_mean: 65,
        actual_rate: 0.5,
        bucket_error: 0.15,
        direction: 'overconfident',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe('In your 60–80% range, 1 of 2 has happened.');
  });

  // Roadmap step 58: from 10 resolved, the range's said-against-happened.
  it('sets what happened against what was said once the range holds 10', () => {
    expect(
      bucketLine({
        low: 40,
        high: 60,
        total_resolved: 25,
        resolved_yes: 13,
        stated_confidence_mean: 47.6,
        actual_rate: 13 / 25,
        bucket_error: 0.044,
        direction: 'calibrated',
        chance_low: 0,
        chance_high: 1,
        expected_yes: 0,
      }),
    ).toBe(
      "In your 40–60% range, 13 of 25 have happened. That's 52%, against the 48% you said on average.",
    );
  });
});

describe('ResolvePrompt milestones', () => {
  it('celebrates the resolution that unlocks the score, once', async () => {
    // 19 already resolved: the next answer is the 20th.
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await insertPrediction(samplePending());
    const userId = useAuthStore.getState().userId!;
    await useStatsStore.getState().recomputeForUser(userId);

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    // Consumed: nothing left for the next screen to replay.
    expect(useStatsStore.getState().milestone).toBeNull();
    // The unlock may earn a rating ask, on Today after the sheet closes (D15).
    expect(useRatingStore.getState().moment).toBe(true);
  });

  it('shows no celebration for an ordinary answer', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(screen.queryByTestId(/^milestone-/)).toBeNull();
  });
});

// Decided 2026-10-06: streak checkpoints at 7, 30, 100 and 365 days.
describe('ResolvePrompt streak checkpoints', () => {
  /**
   * Local noon `back` calendar days ago, or now for today. Subtracting 24h
   * steps could skip or merge a local day near midnight or across DST.
   */
  const daysAgo = (back: number): string => {
    if (back === 0) return new Date().toISOString();
    const d = new Date();
    d.setDate(d.getDate() - back);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  /**
   * Six counted days before today and nothing yet today: the next answer
   * makes seven (one a day since D17; it was two logged today and a third).
   */
  const sixDaysThenToday = async () => {
    for (let back = 6; back >= 1; back -= 1) {
      for (let i = 0; i < 1; i += 1) {
        await insertPrediction(
          samplePending({
            id: `d${back}-${i}`,
            created_at: daysAgo(back),
          }),
        );
      }
    }
    await insertPrediction(samplePending());
    await usePredictionStore.getState().loadPending();
  };

  it('names the checkpoint the answer reached, without a celebration', async () => {
    await sixDaysThenToday();
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
    });
    expect(screen.getByTestId('streak-checkpoint').props.accessibilityLabel).toBe(
      '7-day streak. A full week. Next\u00A0milestone: 30\u00A0days.',
    );
    expect(screen.queryByTestId(/^milestone-/)).toBeNull();
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
  });

  // CLAUDE.md: the day a streak reaches a checkpoint is named on the answer
  // that earned it. It used to give way to a score or badge milestone.
  it('names the checkpoint beside a milestone the same answer reached', async () => {
    await sixDaysThenToday();
    // 19 resolved long ago: this answer is also the 20th, which unlocks the score.
    for (let i = 0; i < 19; i++) {
      await insertPrediction(
        samplePending({
          id: `done-${i}`,
          status: i % 2 ? 'resolved_yes' : 'resolved_no',
          resolved_at: '2026-05-20T00:00:00.000Z',
        }),
      );
    }
    await useStatsStore.getState().recomputeForUser(useAuthStore.getState().userId!);

    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));

    await waitFor(() => {
      expect(screen.getByTestId('milestone-rating_unlocked')).toBeTruthy();
    });
    expect(screen.getByTestId('streak-checkpoint')).toBeTruthy();
  });

  it('shows nothing for an answer that reached no checkpoint', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded')).toBeTruthy();
    });
    expect(screen.queryByTestId('streak-checkpoint')).toBeNull();
  });
});

describe('ResolvePrompt recorded label', () => {
  it('says which answer was recorded, in words', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        "Recorded: it didn't happen",
      );
    });
  });
});

describe('ResolvePrompt change answer', () => {
  it('lets a mis-tap be undone and answered again', async () => {
    await insertPrediction(samplePending());
    const onResolved = jest.fn();
    render(<ResolvePrompt predictionId="p1" onResolved={onResolved} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-no'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-change')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('resolve-change'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    expect((await getPrediction('p1'))?.status).toBe('pending');

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-recorded-label')).toHaveTextContent(
        'Recorded: it happened',
      );
    });
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    expect(onResolved).not.toHaveBeenCalled();
  });
});

describe('ResolvePrompt reflection draft', () => {
  it('reports the unsaved reflection, and clears it when the answer is changed', async () => {
    await insertPrediction(samplePending());
    const onDraftChange = jest.fn();
    render(<ResolvePrompt predictionId="p1" onDraftChange={onDraftChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-yes'));
    await waitFor(() => {
      expect(screen.getByTestId('reflection-field')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('reflection-field'), 'lucky timing');
    expect(onDraftChange).toHaveBeenLastCalledWith('lucky timing');

    fireEvent.press(screen.getByTestId('resolve-change'));
    await waitFor(() => {
      expect(screen.getByTestId('resolve-yes')).toBeTruthy();
    });
    expect(onDraftChange).toHaveBeenLastCalledWith('');
  });
});

// Roadmap D18, refined 2026-10-09: the first answer ever teaches what the
// number means, the same for Yes and No.
describe('firstAnswerLine', () => {
  it('says what the stated number means in tens', () => {
    expect(firstAnswerLine(70)).toBe(
      "That's your first. A 70% call should come true about 7 times in 10, so one answer can't say much; 20 can.",
    );
    expect(firstAnswerLine(10)).toMatch(/about 1 time in 10/);
  });

  it('handles the ends of the scale', () => {
    expect(firstAnswerLine(100)).toMatch(/A 100% call should always come true/);
    expect(firstAnswerLine(0)).toMatch(/A 0% call should never come true/);
    expect(firstAnswerLine(97)).toMatch(/nearly every time/);
    expect(firstAnswerLine(3)).toMatch(/almost never/);
  });
});

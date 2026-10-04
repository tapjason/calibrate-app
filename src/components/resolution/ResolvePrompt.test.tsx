import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction } from '@/db/predictions';
import { getUserStat } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { bucketLine, ResolvePrompt } from './ResolvePrompt';

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
  it('states the bucket in counts after a Yes or No, the same for both', async () => {
    await insertPrediction(samplePending());
    render(<ResolvePrompt predictionId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('resolve-no')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('resolve-no'));

    await waitFor(() => {
      expect(screen.getByTestId('resolve-bucket-line')).toBeTruthy();
    });
    expect(screen.getByText("That's your first call in the 80–100% range.")).toBeTruthy();
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
      }),
    ).toBe('In your 60–80% range, 6 of 9 have happened.');
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

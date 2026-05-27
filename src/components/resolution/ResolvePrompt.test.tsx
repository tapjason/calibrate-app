import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction } from '@/db/predictions';
import { getUserStat } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { ResolvePrompt } from './ResolvePrompt';

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

    fireEvent.changeText(
      screen.getByTestId('reflection-field'),
      'shipped on time',
    );
    fireEvent.press(screen.getByTestId('resolve-yes'));

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

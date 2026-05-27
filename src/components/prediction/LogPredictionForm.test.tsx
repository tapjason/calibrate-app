import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

import { LogPredictionForm } from './LogPredictionForm';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.setState({ userId: null });
  usePredictionStore.setState({ pending: [], resolved: [] });
  useStatsStore.setState({ userStat: null, categoryStats: [] });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
});

describe('LogPredictionForm', () => {
  it('creates a prediction with the entered title, category, and confidence', async () => {
    const onSubmitted = jest.fn();
    render(<LogPredictionForm onSubmitted={onSubmitted} />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'Ship the prototype');
    fireEvent.press(screen.getByTestId('category-health'));
    fireEvent.press(screen.getByTestId('confidence-increment')); // 50 → 55
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });

    const p = usePredictionStore.getState().pending[0];
    expect(p.title).toBe('Ship the prototype');
    expect(p.category).toBe('health');
    expect(p.confidence).toBe(55);
    expect(p.integrity_bonus).toBe(true); // 55 is in [35, 65]
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('surfaces a validation error when title is empty and does not persist', async () => {
    render(<LogPredictionForm />);
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('log-error')).toBeTruthy();
    });
    expect(usePredictionStore.getState().pending).toHaveLength(0);
  });

  it('clamps confidence steppers at 0 and 100', async () => {
    render(<LogPredictionForm />);
    // Decrement 11 times from 50 → should clamp at 0, not go negative
    for (let i = 0; i < 11; i++) {
      fireEvent.press(screen.getByTestId('confidence-decrement'));
    }
    // Just verify the slider didn't crash; details checked via store after submit
    fireEvent.changeText(screen.getByTestId('title-field'), 't');
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].confidence).toBe(0);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

import { LogPredictionForm } from './LogPredictionForm';

// Default mock: refine returns null (Supabase isn't configured under tests).
// Individual tests override this via mockResolvedValueOnce.
jest.mock('@/ai/refine', () => ({
  refinePrediction: jest.fn(async () => null),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { refinePrediction } = require('@/ai/refine') as {
  refinePrediction: jest.Mock;
};

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
  refinePrediction.mockReset();
  refinePrediction.mockResolvedValue(null);
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

  it('disables the refine button when the title is empty', () => {
    render(<LogPredictionForm />);
    const btn = screen.getByTestId('refine-button');
    fireEvent.press(btn);
    expect(refinePrediction).not.toHaveBeenCalled();
  });

  it('shows the suggestion when refine returns a rewrite, replaces title on Accept', async () => {
    refinePrediction.mockResolvedValueOnce('Ship 3 priority tasks by Friday');
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), "do better at work");
    fireEvent.press(screen.getByTestId('refine-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refine-suggestion')).toBeTruthy();
    });
    expect(screen.getByText('Ship 3 priority tasks by Friday')).toBeTruthy();

    fireEvent.press(screen.getByTestId('refine-accept'));

    // Submit and verify the saved title is the accepted suggestion
    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe(
      'Ship 3 priority tasks by Friday',
    );
  });

  it('Dismiss hides the suggestion without changing the title', async () => {
    refinePrediction.mockResolvedValueOnce('Suggested rewrite');
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'original');
    fireEvent.press(screen.getByTestId('refine-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refine-suggestion')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('refine-dismiss'));

    expect(screen.queryByTestId('refine-suggestion')).toBeNull();

    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe('original');
  });

  it('save flow is unaffected when refine returns null', async () => {
    refinePrediction.mockResolvedValueOnce(null);
    render(<LogPredictionForm />);

    fireEvent.changeText(screen.getByTestId('title-field'), 'plain prediction');
    fireEvent.press(screen.getByTestId('refine-button'));

    // wait for refine to settle, then save normally
    await waitFor(() => {
      expect(refinePrediction).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('refine-suggestion')).toBeNull();

    fireEvent.press(screen.getByTestId('submit-button'));
    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(usePredictionStore.getState().pending[0].title).toBe('plain prediction');
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

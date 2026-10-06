import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { REFINE_ENABLED } from '@/constants/app';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
} from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';

import { LogPredictionForm } from './LogPredictionForm';

// The companion LogPredictionForm.test.tsx forces REFINE_ENABLED on so the
// dormant behavior stays covered. This file deliberately does NOT mock the
// constant: it asserts the cut itself, using the real released value.

jest.mock('@/ai/refine', () => ({
  refinePrediction: jest.fn(async () => 'a rewrite that must never be offered'),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { refinePrediction } = require('@/ai/refine') as {
  refinePrediction: jest.Mock;
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [] });
  useStatsStore.setState({
    coverageGap: { logged: 0, buckets_used: 0, low_end_empty: true },
  });
  // The user preference is ON — the release flag has to win anyway.
  useSettingsStore.setState({ aiRefineEnabled: true, hydrated: false });
  await useAuthStore.getState().initialize();
  refinePrediction.mockClear();
});

afterEach(() => {
  setDbForTests(null);
  __setPersistenceForTests(null);
});

describe('LogPredictionForm with refine cut from the release', () => {
  it('is actually cut', () => {
    // Guard: if this ever fails, refine was switched back on and the
    // assertions below are testing nothing.
    expect(REFINE_ENABLED).toBe(false);
  });

  it('never shows the refine button, even with the setting enabled', () => {
    render(<LogPredictionForm onSubmitted={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'I will ship it');
    expect(screen.queryByTestId('refine-button')).toBeNull();
    expect(screen.queryByTestId('refine-suggestion')).toBeNull();
  });

  it('never calls the refine service', async () => {
    render(<LogPredictionForm onSubmitted={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'I will ship it');
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(usePredictionStore.getState().pending).toHaveLength(1);
    });
    expect(refinePrediction).not.toHaveBeenCalled();
  });

  it('still saves the title exactly as typed', async () => {
    render(<LogPredictionForm onSubmitted={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('title-field'), 'I will ship it');
    fireEvent.press(screen.getByTestId('confidence-increment'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(usePredictionStore.getState().pending[0].title).toBe(
        'I will ship it',
      );
    });
  });
});

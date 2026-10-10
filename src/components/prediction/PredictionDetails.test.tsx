import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction, listPendingDeletions } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { PredictionDetails } from './PredictionDetails';

const USER = 'local-user-v1';

const open = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: USER,
  title: 'Ship the beta',
  category: 'work',
  confidence: 70,
  created_at: '2026-10-04T12:00:00.000Z',
  due_date: '2099-10-16T12:00:00.000Z',
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
  useStatsStore.setState({ userStat: null, categoryStats: [], calibration: { rating: 0, buckets: [] } });
  useSettingsStore.setState({ notificationsEnabled: true });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
});

const renderDetails = (props: Partial<React.ComponentProps<typeof PredictionDetails>> = {}) =>
  render(
    <PredictionDetails predictionId="p1" onClose={jest.fn()} onAnswer={jest.fn()} {...props} />,
  );

describe('PredictionDetails (roadmap D25)', () => {
  it('says what you said first, then the title and the due date', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
    expect(screen.getByTestId('details-stated')).toHaveTextContent(/you said 70%/);
    expect(screen.getByTestId('details-title')).toHaveTextContent('Ship the beta');
    expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due .+ · reminder that evening$/);
  });

  it('says reminders are off when they are', async () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/reminders off$/));
  });

  it('edits the title and category, never the confidence', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));

    expect(screen.queryByTestId('confidence-readout')).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), 'Ship the beta to ten people');
    fireEvent.press(screen.getByTestId('category-personal'));
    fireEvent.press(screen.getByTestId('details-save'));

    await waitFor(() => expect(screen.getByTestId('details')).toBeTruthy());
    expect(screen.getByTestId('details-title')).toHaveTextContent('Ship the beta to ten people');
    const saved = await getPrediction('p1');
    expect(saved).toMatchObject({ category: 'personal', confidence: 70 });
  });

  it('keeps Save changes waiting for a title', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    fireEvent.changeText(screen.getByTestId('details-title-field'), '   ');
    expect(screen.getByTestId('details-save').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('deletes only after a confirmation, and closes', async () => {
    await insertPrediction(open());
    const onClose = jest.fn();
    renderDetails({ onClose });
    await waitFor(() => expect(screen.getByTestId('details-delete')).toBeTruthy());

    fireEvent.press(screen.getByTestId('details-delete'));
    expect(screen.getByTestId('details-delete-confirm')).toHaveTextContent(/can't be undone/);
    expect(await getPrediction('p1')).not.toBeNull();

    fireEvent.press(screen.getByTestId('details-delete-yes'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  it('cancels a delete', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-delete'));
    fireEvent.press(screen.getByTestId('details-delete-cancel'));
    expect(screen.queryByTestId('details-delete-confirm')).toBeNull();
    expect(await getPrediction('p1')).not.toBeNull();
  });

  it('says it is early before answering, then hands over to Resolve', async () => {
    await insertPrediction(open());
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());

    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(/It's due .+\. Answering early is fine/);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('details-answer-now'));
    expect(onAnswer).toHaveBeenCalledWith('p1');
  });

  it('says so when the prediction is no longer open', async () => {
    await insertPrediction(open({ status: 'resolved_yes', resolved_at: '2026-10-09T12:00:00.000Z' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-missing')).toBeTruthy());
  });
});

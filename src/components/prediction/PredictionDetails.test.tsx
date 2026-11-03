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
    expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due .+, with a reminder at 7:00\sPM$/);
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

  // Blind playtest 2026-11-01: a picked due date showed "Pick a date" chosen
  // and no date field until a second tap.
  it('shows the date field at once for a picked due date', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.getByTestId('due-pick').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('due-picker')).toBeTruthy();
  });

  it('keeps Save changes waiting for a title', async () => {
    await insertPrediction(open());
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-edit-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-edit-button'));
    expect(screen.queryByTestId('details-needs')).toBeNull();
    fireEvent.changeText(screen.getByTestId('details-title-field'), '   ');
    expect(screen.getByTestId('details-save').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // And says so (blind playtest 2026-11-01).
    expect(screen.getByTestId('details-needs')).toHaveTextContent('To save, add the prediction.');
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

  // Roadmap D41: logged today, an answer today isn't scored; it says so first.
  it('warns that an answer the day it was logged is not scored', async () => {
    await insertPrediction(open({ created_at: new Date().toISOString() }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(
      /You logged it today, though, so an answer today isn’t scored\. From tomorrow it is\./,
    );
  });

  it('says it is early before answering, then hands over to Resolve', async () => {
    await insertPrediction(open());
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-answer')).toBeTruthy());

    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.getByTestId('details-early')).toHaveTextContent(/It's due .+\. Answering early is fine/);
    expect(screen.getByTestId('details-early')).not.toHaveTextContent(/isn’t scored/);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('details-answer-now'));
    expect(onAnswer).toHaveBeenCalledWith('p1');
  });

  it('goes straight to Resolve once it is due, as after an edit to today', async () => {
    const noonToday = new Date();
    noonToday.setHours(12, 0, 0, 0);
    await insertPrediction(open({ due_date: noonToday.toISOString() }));
    const onAnswer = jest.fn();
    renderDetails({ onAnswer });
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due today/));

    fireEvent.press(screen.getByTestId('details-answer'));
    expect(screen.queryByTestId('details-early')).toBeNull();
    expect(onAnswer).toHaveBeenCalledWith('p1');
  });

  it('promises no reminder for a due day that has passed', async () => {
    await insertPrediction(open({ due_date: '2020-10-16T12:00:00.000Z' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-due')).toHaveTextContent(/^Due [^·]+$/));
  });

  // A Yes or No has its own details since D34; a skip is answered in Resolve.
  it('says so when the prediction is no longer open', async () => {
    await insertPrediction(open({ status: 'skipped', resolved_at: '2026-10-09T12:00:00.000Z' }));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('details-missing')).toBeTruthy());
  });
});

// Roadmap D34: an answered prediction opens its details from History, and for
// a day can be switched, moved or deleted; after that it's the record.
describe('PredictionDetails, answered (roadmap D34)', () => {
  const answered = (hoursAgo: number, over: Partial<Prediction> = {}) => {
    const at = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    return open({ status: 'resolved_no', resolved_at: at, due_date: at, ...over });
  };

  it('switches the answer, moves it and keeps when it was answered', async () => {
    const p = answered(1);
    await insertPrediction(p);
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-window')).toBeTruthy());
    expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It didn’t happen/);

    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(() =>
      expect(screen.getByTestId('answered-outcome')).toHaveTextContent(/^It happened/),
    );
    fireEvent.press(screen.getByTestId('category-health'));
    await waitFor(() => expect(screen.getByTestId('answered-category')).toHaveTextContent('Health'));

    const saved = await getPrediction('p1');
    expect(saved).toMatchObject({ status: 'resolved_yes', category: 'health', confidence: 70 });
    expect(saved?.resolved_at).toBe(p.resolved_at);
  });

  it('deletes one only after a confirmation', async () => {
    await insertPrediction(answered(2));
    const onClose = jest.fn();
    renderDetails({ onClose });
    await waitFor(() => expect(screen.getByTestId('answered-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('answered-delete'));
    fireEvent.press(screen.getByTestId('answered-delete-yes'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await getPrediction('p1')).toBeNull();
  });

  it('says an answer older than a day is the record, and offers nothing to change', async () => {
    await insertPrediction(answered(30));
    renderDetails();
    await waitFor(() => expect(screen.getByTestId('answered-locked')).toBeTruthy());
    expect(screen.queryByTestId('answered-switch')).toBeNull();
    expect(screen.queryByTestId('answered-delete')).toBeNull();
    expect(screen.queryByTestId('category-health')).toBeNull();
  });
});

// Review 2026-11-01: a window that closes while the sheet is open says so in
// the store's words, and the controls go.
describe('PredictionDetails, answered, window closed while open', () => {
  it('shows the record sentence and drops the controls', async () => {
    const at = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const p = open({ status: 'resolved_no', resolved_at: at, due_date: at });
    await insertPrediction(p);
    const { AnsweredDetails } = jest.requireActual('./AnsweredDetails');
    // The sheet believes it's an hour after the answer; the store knows better.
    const onePastAnswer = new Date(Date.parse(at) + 60 * 60 * 1000);
    const { rerender } = render(
      <AnsweredDetails prediction={p} onChanged={jest.fn()} onClose={jest.fn()} now={onePastAnswer} />,
    );
    fireEvent.press(screen.getByTestId('answered-switch'));
    await waitFor(() => expect(screen.getByText(/part of the record now/)).toBeTruthy());
    rerender(<AnsweredDetails prediction={p} onChanged={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('answered-switch')).toBeNull();
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });
});

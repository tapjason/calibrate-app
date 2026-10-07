import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { getPrediction, insertPrediction } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { ResolveRun, runSummary } from './ResolveRun';

const USER = 'local-user-v1';

const pending = (overrides: Partial<Prediction>): Prediction => ({
  id: 'p1',
  user_id: USER,
  title: 'Ship the prototype',
  category: 'work',
  confidence: 80,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T12:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

/** Three ready (due in the past, out of order) and one that isn't due yet. */
async function seed(): Promise<void> {
  const rows: [string, string, string][] = [
    ['b', 'Second due', '2026-06-02'],
    ['a', 'First due', '2026-06-01'],
    ['c', 'Third due', '2026-06-03'],
    ['z', 'Not yet', '2099-01-01'],
  ];
  for (const [id, title, day] of rows) {
    await insertPrediction(pending({ id, title, due_date: `${day}T12:00:00.000Z` }));
  }
  await usePredictionStore.getState().loadPending();
}

async function answer(testID: 'resolve-yes' | 'resolve-no'): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(testID)).toBeTruthy());
  fireEvent.press(screen.getByTestId(testID));
  await waitFor(() => expect(screen.getByTestId('resolve-recorded')).toBeTruthy());
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  usePredictionStore.setState({ pending: [], resolved: [], streakCheckpoint: null });
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
  await useAuthStore.getState().initialize();
});

afterEach(() => setDbForTests(null));

describe('ResolveRun (roadmap step 18)', () => {
  it('steps through the ready predictions in due order, then closes', async () => {
    await seed();
    const onClose = jest.fn();
    render(<ResolveRun onClose={onClose} />);

    await waitFor(() => expect(screen.getByText('First due')).toBeTruthy());
    expect(screen.getByText('1 of 3')).toBeTruthy();
    await answer('resolve-yes');
    fireEvent.press(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Second due')).toBeTruthy());
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await answer('resolve-no');
    fireEvent.press(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Third due')).toBeTruthy());
    await answer('resolve-yes');
    // The last card finishes rather than promising a next one.
    fireEvent.press(screen.getByText('Finish'));

    await waitFor(() => expect(screen.getByTestId('resolve-run-done')).toBeTruthy());
    // Roadmap step 65: what the run came to, and the day it made count.
    expect(screen.getByTestId('resolve-run-summary')).toHaveTextContent(
      '3 answered. 2 happened. You expected about\u00A02.',
    );
    expect(screen.getByTestId('resolve-run-streak').props.accessibilityLabel).toBe(
      '1-day streak. Today counts. Next\u00A0milestone: 7\u00A0days.',
    );
    fireEvent.press(screen.getByTestId('resolve-run-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    expect((await getPrediction('a'))?.status).toBe('resolved_yes');
    expect((await getPrediction('b'))?.status).toBe('resolved_no');
    // Not due yet, so never part of the run.
    expect((await getPrediction('z'))?.status).toBe('pending');
  });

  it('moves straight on after a skip', async () => {
    await seed();
    render(<ResolveRun onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resolve-skip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('resolve-skip'));
    await waitFor(() => expect(screen.getByText('Second due')).toBeTruthy());
    expect((await getPrediction('a'))?.status).toBe('skipped');
  });

  it('keeps the reflection one tap away instead of in the way', async () => {
    await seed();
    render(<ResolveRun onClose={jest.fn()} />);
    await answer('resolve-yes');
    expect(screen.queryByTestId('reflection-field')).toBeNull();
    fireEvent.press(screen.getByTestId('resolve-add-reflection'));
    expect(screen.getByTestId('reflection-field')).toBeTruthy();
  });

  it('passes over a card that was resolved elsewhere meanwhile', async () => {
    await seed();
    render(<ResolveRun onClose={jest.fn()} />);
    await answer('resolve-yes');
    // The second card gets answered from somewhere else (a notification, a sync).
    await usePredictionStore.getState().resolve('b', 'resolved_no');
    fireEvent.press(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Third due')).toBeTruthy());
    await answer('resolve-yes');
    fireEvent.press(screen.getByText('Finish'));
    await waitFor(() => expect(screen.getByTestId('resolve-run-done')).toBeTruthy());
    // The summary is the two answered here; b's No belongs to wherever it was given.
    expect(screen.getByTestId('resolve-run-summary')).toHaveTextContent(/^2 answered\. 2 happened\./);
  });

  it('says so when nothing is ready, with no tally or streak to show', async () => {
    render(<ResolveRun onClose={jest.fn()} />);
    expect(screen.getByText('Nothing is ready to resolve right now.')).toBeTruthy();
    expect(screen.queryByTestId('resolve-run-summary')).toBeNull();
    expect(screen.queryByTestId('resolve-run-streak')).toBeNull();
  });
});

describe('runSummary (roadmap step 65)', () => {
  const tally = (resolved: number, happened: number, expected: number, skipped = 0) => ({
    resolved,
    happened,
    expected,
    skipped,
  });

  it('sets what happened against what the numbers expected', () => {
    expect(runSummary(tally(5, 4, 2.6))).toBe('5 answered. 4 happened. You expected about\u00A03.');
    expect(runSummary(tally(3, 0, 0.9))).toBe('3 answered. None happened. You expected about\u00A01.');
  });

  it("counts a can't-tell apart", () => {
    expect(runSummary(tally(2, 1, 1.2, 1))).toBe(
      "2 answered, 1 can't tell. 1 happened. You expected about\u00A01.",
    );
    expect(runSummary(tally(0, 0, 0, 3))).toBe("3 marked can't tell.");
  });

  it('leaves one answer to the line its card already showed, and nothing to nothing', () => {
    expect(runSummary(tally(1, 1, 0.7))).toBe('1 answered.');
    expect(runSummary(tally(0, 0, 0))).toBeNull();
  });
});

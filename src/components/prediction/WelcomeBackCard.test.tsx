import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { usePracticeStore } from '@/store/practiceStore';
import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction } from '@/types';

import { WelcomeBackCard } from './WelcomeBackCard';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const base: Prediction = {
  id: 'p1',
  user_id: 'local-user-v1',
  title: 'Porto win at home',
  category: 'personal',
  confidence: 70,
  created_at: daysAgo(70),
  due_date: daysAgo(40),
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
};

// Roadmap D51 (blind playtest 2026-11-09b, finding 4).
describe('WelcomeBackCard', () => {
  beforeEach(() => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    useSettingsStore.setState({ welcomeBackDismissedFor: null });
    useStatsStore.setState({ userStat: null });
    usePracticeStore.setState({ answers: [] });
  });

  afterEach(() => {
    __setPersistenceForTests(null);
  });

  it('says what changed after a long gap, and goes on Got it', async () => {
    usePredictionStore.setState({ pending: [base], resolved: [] });
    render(<WelcomeBackCard />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText(/^One prediction is ready to answer\./)).toBeTruthy();

    fireEvent.press(screen.getByTestId('welcome-back-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('welcome-back')).toBeNull());
    expect(useSettingsStore.getState().welcomeBackDismissedFor).toBe(base.created_at);
  });

  it('stays dismissed when the row it was dismissed for is deleted', async () => {
    const older = { ...base, id: 'p0', created_at: daysAgo(90) };
    usePredictionStore.setState({ pending: [base, older], resolved: [] });
    const view = render(<WelcomeBackCard />);
    fireEvent.press(screen.getByTestId('welcome-back-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('welcome-back')).toBeNull());
    usePredictionStore.setState({ pending: [older], resolved: [] });
    view.rerender(<WelcomeBackCard />);
    expect(screen.queryByTestId('welcome-back')).toBeNull();
  });

  it('shows nothing to someone who practised last week', () => {
    usePracticeStore.setState({
      answers: [{ day: Math.floor((Date.now() - 6 * 86_400_000) / 86_400_000), slot: 0, correct: true, confidence: 70 } as never],
    });
    usePredictionStore.setState({ pending: [base], resolved: [] });
    render(<WelcomeBackCard />);
    expect(screen.queryByTestId('welcome-back')).toBeNull();
    usePracticeStore.setState({ answers: [] });
  });

  it('shows nothing to someone who was here last week', () => {
    usePredictionStore.setState({ pending: [{ ...base, created_at: daysAgo(6) }], resolved: [] });
    render(<WelcomeBackCard />);
    expect(screen.queryByTestId('welcome-back')).toBeNull();
  });
});

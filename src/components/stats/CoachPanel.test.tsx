import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { FREE_ENTITLEMENT, type CoachInsight, type UserStat } from '@/types';

import { CoachPanel } from './CoachPanel';

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 72,
  total_predictions: 50,
  total_resolved: 40,
  current_streak: 2,
  rating_is_provisional: false,
};

const INSIGHT: CoachInsight = {
  type: 'overconfidence',
  category: 'finance',
  message: 'Your finance predictions run overconfident — 80% stated, 55% actual.',
  evidence: 80,
  suggestion: 'Try stating finance calls 15 points lower.',
};

function seed({
  isPlus = true,
  coachEnabled = true,
}: { isPlus?: boolean; coachEnabled?: boolean } = {}): void {
  useEntitlementStore.setState({
    entitlement: isPlus
      ? { is_plus: true, source: 'annual', expires_at: null }
      : FREE_ENTITLEMENT,
    isPlus,
    hydrated: true,
  });
  useSettingsStore.setState({
    notificationsEnabled: true,
    aiRefineEnabled: true,
    coachEnabled,
    hydrated: true,
  });
  useStatsStore.setState({
    userStat: USER_STAT,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
  usePredictionStore.setState({ pending: [], resolved: [] });
  useCoachStore.setState({
    insights: [],
    crisisTopic: null,
    loading: false,
    lastAnsweredAt: null,
    lastRequestFailed: false,
  });
}

describe('CoachPanel — gating', () => {
  it('shows an upsell and no ask button for a free user', () => {
    seed({ isPlus: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-upsell')).toBeTruthy();
    expect(screen.queryByTestId('coach-ask')).toBeNull();
  });

  it('points at Settings when Plus but Coach is off', () => {
    seed({ coachEnabled: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-disabled')).toBeTruthy();
    expect(screen.queryByTestId('coach-ask')).toBeNull();
  });

  it('offers the ask button when Plus and enabled', () => {
    seed();
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-ask')).toBeTruthy();
  });

  // §5.6 — the Coach must be clearly labeled as AI wherever it speaks.
  it('labels the surface as AI', () => {
    seed();
    render(<CoachPanel />);
    expect(screen.getByText('AI')).toBeTruthy();
  });
});

describe('CoachPanel — rendering insights', () => {
  it('renders a cached insight with its suggestion', () => {
    seed();
    useCoachStore.setState({
      insights: [INSIGHT],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-insight-finance')).toBeTruthy();
    expect(screen.getByText(/run overconfident/)).toBeTruthy();
    expect(screen.getByText('Try stating finance calls 15 points lower.')).toBeTruthy();
  });

  it('says so plainly when the Coach answered with nothing', () => {
    seed();
    useCoachStore.setState({ lastAnsweredAt: '2026-08-29T12:00:00.000Z' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-nothing-to-say')).toBeTruthy();
  });

  it('distinguishes an outage from an empty answer', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
  });

  it('disables the button while a request is in flight', () => {
    seed();
    useCoachStore.setState({ loading: true });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('asks the store for insights on press', async () => {
    seed();
    const calls: unknown[] = [];
    useCoachStore.setState({
      requestInsights: async (request) => {
        calls.push(request);
      },
    });

    render(<CoachPanel />);
    fireEvent.press(screen.getByTestId('coach-ask'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ isPlus: true, enabled: true });
  });
});

// §5.5 — the support surface replaces coaching entirely.
describe('CoachPanel — crisis path', () => {
  it('renders support instead of insights', () => {
    seed();
    useCoachStore.setState({ insights: [INSIGHT], crisisTopic: 'self_harm' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
  });

  it('points at the resource matching the topic', () => {
    seed();
    useCoachStore.setState({ crisisTopic: 'eating_disorder' });
    render(<CoachPanel />);

    expect(screen.getByTestId('support-contact').props.children).toMatch(
      /Eating Disorders/,
    );
  });

  it('offers no statistic or suggestion on the support surface', () => {
    seed();
    useCoachStore.setState({ crisisTopic: 'distress' });
    render(<CoachPanel />);

    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
  });
});

// "How scoring works" (app/scoring.tsx). It lives here because a test file
// under app/ would be a route to Expo Router.
import { render, screen } from '@testing-library/react-native';

import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { Prediction, UserStat } from '@/types';

import ScoringScreen from '../../../app/scoring';

let mockSection: string | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => (mockSection === undefined ? {} : { section: mockSection }),
}));

const DAY = 24 * 60 * 60 * 1000;

/** A yes/no answer given `answeredDaysAgo`, logged two days before it (so scored). */
function answered(i: number, answeredDaysAgo: number, yes: boolean): Prediction {
  const at = Date.now() - answeredDaysAgo * DAY;
  return {
    id: `p${i}`,
    user_id: 'u1',
    title: `Call ${i}`,
    category: 'work',
    confidence: 70,
    created_at: new Date(at - 2 * DAY).toISOString(),
    due_date: new Date(at - DAY).toISOString(),
    status: yes ? 'resolved_yes' : 'resolved_no',
    resolved_at: new Date(at).toISOString(),
    reflection: null,
    integrity_bonus: false,
  };
}

// 20 answered ten days ago and 5 this week: the rating is unlocked at both
// ends, so "since last week" has something to say.
const RESOLVED: Prediction[] = [
  ...Array.from({ length: 20 }, (_, i) => answered(i, 10, i < 14)),
  ...Array.from({ length: 5 }, (_, i) => answered(20 + i, 2, i < 3)),
];

const unlocked: UserStat = {
  user_id: 'u1',
  calibration_rating: 86,
  total_predictions: 25,
  total_resolved: 25,
  current_streak: 0,
  rating_is_provisional: false,
};

function seed(userStat: UserStat) {
  useStatsStore.setState({
    userStat,
    perfect: { typical: 88, low: 84, high: 91 },
    ratingRange: { giveOrTake: 3, low: 83, high: 89 },
    calibration: { rating: userStat.calibration_rating, buckets: [] },
  });
  usePredictionStore.setState({ pending: [], resolved: RESOLVED });
}

const ratingLines = () => screen.queryAllByTestId(/^scoring-rating-line-\d+$/);

afterEach(() => {
  mockSection = undefined;
  usePredictionStore.setState({ pending: [], resolved: [] });
});

// D76: Insights' "What does this mean?" opens How scoring works with the
// person's own lines on top, the ones the page left out.
describe('ScoringScreen', () => {
  it('puts the four rating lines on top when opened from a rating', () => {
    seed(unlocked);
    mockSection = 'rating';
    render(<ScoringScreen />);
    const lines = ratingLines().map((n) => String(n.props.children));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^Your rating is 86\. Range by range/);
    expect(lines[1]).toMatch(/^Even perfectly calibrated, 25 answers like yours/);
    expect(lines[2]).toBe('Give or take 3 points with this many predictions.');
    expect(lines[3]).toMatch(/since last week, from 5 answers given since then/);
  });

  it.each([['badges'], ['streak'], [undefined]])('shows no rating lines for section=%s', (section) => {
    seed(unlocked);
    mockSection = section;
    render(<ScoringScreen />);
    expect(ratingLines()).toHaveLength(0);
    expect(screen.queryByTestId('scoring-rating-line')).toBeNull();
    expect(screen.queryByText(/^Your rating is/)).toBeNull();
  });

  it('shows none while the rating is provisional, from a rating too', () => {
    seed({ ...unlocked, total_resolved: 12, rating_is_provisional: true });
    mockSection = 'rating';
    render(<ScoringScreen />);
    expect(ratingLines()).toHaveLength(0);
    expect(screen.queryByTestId('scoring-rating-line')).toBeNull();
    expect(screen.queryByText(/^Your rating is/)).toBeNull();
  });
});

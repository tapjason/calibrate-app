import { fireEvent, render, screen } from '@testing-library/react-native';

import { useCategoryStore } from '@/store/categoryStore';
import { useStatsStore } from '@/store/statsStore';
import type { Category, CategoryStat, RatingRange, UserStat } from '@/types';

import { CategoryBadge } from './CategoryBadge';
import { NextBadgeLine } from './NextBadgeLine';

const stat = (category: Category, resolved: number): CategoryStat => ({
  user_id: 'u1',
  category,
  predictions_made: resolved,
  predictions_resolved: resolved,
  calibration_score: 80,
  score_is_provisional: resolved < 20,
  badge_level: resolved >= 20 ? 'tracker' : 'guesser',
});
/** A category's give-or-take around its score, whole points as the engine gives it. */
const range = (score: number, giveOrTake: number): RatingRange => ({
  giveOrTake,
  low: Math.round(score) - giveOrTake,
  high: Math.round(score) + giveOrTake,
});
const user: UserStat = {
  user_id: 'u1',
  calibration_rating: 86,
  total_predictions: 30,
  total_resolved: 30,
  current_streak: 0,
  rating_is_provisional: false,
};

// Step 173 (blind playtest 2026-11-12f, finding 6): with no badge yet, Today
// names the closest one.
describe('NextBadgeLine', () => {
  beforeEach(() => useCategoryStore.setState({ defs: [] }));

  it('names the closest badge while no category has one, and opens the tiers', () => {
    useStatsStore.setState({
      userStat: user,
      categoryStats: [stat('work', 13), stat('health', 17)],
      nextBadges: {
        work: { badge: 'tracker', needResolved: 20, needScore: null },
        health: { badge: 'tracker', needResolved: 20, needScore: null },
      },
      categoryRanges: {},
    });
    const onPress = jest.fn();
    render(<NextBadgeLine onPress={onPress} />);
    // D76: Today's own words, aloud as on screen.
    expect(screen.getByTestId('home-next-badge')).toHaveTextContent(
      '3 more scored answers to your first badge in health.',
    );
    expect(screen.getByTestId('home-next-badge').props.accessibilityLabel).toBe(
      '3 more scored answers to your first badge in health.',
    );
    fireEvent.press(screen.getByTestId('home-next-badge'));
    expect(onPress).toHaveBeenCalled();
  });

  it('says a score gate with room to spare, and the low-end rule stays behind the tap', () => {
    // The words only: the line shows while no category has a badge, so a
    // score gate is rare here, and the state is made up to reach it.
    useStatsStore.setState({
      userStat: user,
      categoryStats: [{ ...stat('work', 25), calibration_score: 64.8, badge_level: 'guesser' }],
      nextBadges: { work: { badge: 'forecaster', needResolved: 20, needScore: 70 } },
      categoryRanges: { work: range(64.8, 5) },
    });
    render(<NextBadgeLine onPress={jest.fn()} />);
    expect(screen.getByTestId('home-next-badge')).toHaveTextContent(
      "Forecaster in work needs a score that clears 70 with room to spare. You’re at 65.",
    );
    expect(screen.getByTestId('home-next-badge')).not.toHaveTextContent(/give or take|low end/);
  });

  // Record audit 2026-11-23: this line said 64 for a 64.8 while Insights'
  // badge row said 65.
  it('prints the same score as Insights badge row for a score with a fraction', () => {
    for (const score of [64.8, 64.5, 66.2]) {
      const work: CategoryStat = { ...stat('work', 25), calibration_score: score };
      const next = { badge: 'forecaster' as const, needResolved: 20, needScore: 70 };
      useStatsStore.setState({
        userStat: user,
        categoryStats: [{ ...work, badge_level: 'guesser' }],
        nextBadges: { work: next },
        categoryRanges: { work: range(score, 5) },
      });
      const line = render(<NextBadgeLine onPress={jest.fn()} />);
      const lineNumber = /You’re at (\d+)\./.exec(
        String(screen.getByTestId('home-next-badge').props.accessibilityLabel),
      )?.[1];
      line.unmount();
      const badge = render(<CategoryBadge stat={work} next={next} giveOrTake={5} />);
      const badgeNumber = /^Score (\d+),/.exec(
        String(screen.getByTestId('category-work-score').props.children),
      )?.[1];
      badge.unmount();
      expect(lineNumber).toBeDefined();
      expect(lineNumber).toBe(badgeNumber);
    }
  });

  it('says nothing once a category has a badge (the identity line speaks)', () => {
    useStatsStore.setState({
      userStat: user,
      categoryStats: [stat('work', 22)],
      nextBadges: { work: { badge: 'forecaster', needResolved: 20, needScore: 70 } },
      categoryRanges: {},
    });
    render(<NextBadgeLine onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-next-badge')).toBeNull();
  });
});

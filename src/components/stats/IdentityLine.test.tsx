import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BadgeLevel, Category, CategoryStat, UserStat } from '@/types';

import { homeIdentity, IdentityLine } from './IdentityLine';

const USER: UserStat = {
  user_id: 'u1',
  calibration_rating: 88,
  total_predictions: 120,
  total_resolved: 110,
  current_streak: 3,
  rating_is_provisional: false,
};

function cat(category: Category, badge: BadgeLevel, resolved = 30, score = 80): CategoryStat {
  return {
    user_id: 'u1',
    category,
    predictions_made: resolved,
    predictions_resolved: resolved,
    calibration_score: score,
    score_is_provisional: resolved < 15,
    badge_level: badge,
  };
}

describe('homeIdentity (roadmap step 28)', () => {
  it('leads with the best category and keeps the weakest as the contrast', () => {
    expect(
      homeIdentity(USER, [cat('finance', 'guesser', 17, 62), cat('health', 'sharp', 60, 96)]),
    ).toEqual({ identity: 'Sharp in health', contrast: 'Guesser in finance', badge: 'sharp' });
  });

  it('has no contrast with a single category', () => {
    expect(homeIdentity(USER, [cat('work', 'tracker', 22, 60)])).toEqual({
      identity: 'Tracker in work',
      contrast: null,
      badge: 'tracker',
    });
  });

  it('says nothing while every category is a Guesser, or with no stats', () => {
    expect(homeIdentity(USER, [cat('work', 'guesser', 8), cat('health', 'guesser', 5)])).toBeNull();
    expect(homeIdentity(null, [])).toBeNull();
  });
});

describe('IdentityLine', () => {
  it('opens the share card, and reads as one sentence', () => {
    const onPress = jest.fn();
    render(
      <IdentityLine
        userStat={USER}
        categoryStats={[cat('finance', 'guesser', 17, 62), cat('health', 'sharp', 60, 96)]}
        onPress={onPress}
      />,
    );
    const line = screen.getByTestId('home-identity');
    expect(line.props.accessibilityLabel).toBe('Sharp in health. Guesser in finance.');
    fireEvent.press(line);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for an all-Guesser user', () => {
    render(<IdentityLine userStat={USER} categoryStats={[cat('work', 'guesser')]} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-identity')).toBeNull();
  });
});

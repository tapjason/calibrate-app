import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useCategoryStore } from '@/store/categoryStore';
import { MIN_N_CATEGORY, type BadgeLevel, type Category, type CategoryStat, type UserStat } from '@/types';

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
    score_is_provisional: resolved < MIN_N_CATEGORY,
    badge_level: badge,
  };
}

describe('homeIdentity (roadmap step 28)', () => {
  it('leads with the best category and keeps the weakest as the contrast', () => {
    expect(
      homeIdentity(USER, [cat('finance', 'tracker', 24, 62), cat('health', 'sharp', 60, 96)]),
    ).toEqual({ identity: 'Gold in health', contrast: 'Bronze in finance', badge: 'sharp' });
    // Roadmap D27: a Guesser (fewer than 20 answered) is never the contrast.
    expect(
      homeIdentity(USER, [cat('finance', 'guesser', 17, 62), cat('health', 'sharp', 60, 96)]),
    ).toEqual({ identity: 'Gold in health', contrast: null, badge: 'sharp' });
  });

  it('has no contrast with a single category', () => {
    expect(homeIdentity(USER, [cat('work', 'tracker', 22, 60)])).toEqual({
      identity: 'Bronze in work',
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
  // Playtest 2026-11-08b, finding 3: the line kept the old name until
  // something else re-rendered Today.
  it('follows a rename', () => {
    render(<IdentityLine userStat={USER} categoryStats={[cat('health', 'sharp', 60, 96)]} onPress={jest.fn()} />);
    expect(screen.getByText('Gold in health')).toBeTruthy();
    act(() => {
      useCategoryStore.setState({
        defs: [
          {
            id: 'health',
            user_id: 'u1',
            name: 'Running',
            icon: null,
            hidden: false,
            position: 0,
            created_at: '2026-11-01T00:00:00.000Z',
          },
        ],
      });
    });
    expect(screen.getByText('Gold in Running')).toBeTruthy();
    act(() => useCategoryStore.setState({ defs: [] }));
  });

  it('explains the badges when tapped, and reads as one sentence', () => {
    const onPress = jest.fn();
    render(
      <IdentityLine
        userStat={USER}
        categoryStats={[cat('finance', 'tracker', 24, 62), cat('health', 'sharp', 60, 96)]}
        onPress={onPress}
      />,
    );
    const line = screen.getByTestId('home-identity');
    expect(line.props.accessibilityLabel).toBe('Gold in health. Bronze in finance.');
    expect(line.props.accessibilityHint).toBe('Explains the badges');
    fireEvent.press(line);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for an all-Guesser user', () => {
    render(<IdentityLine userStat={USER} categoryStats={[cat('work', 'guesser')]} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-identity')).toBeNull();
  });
});



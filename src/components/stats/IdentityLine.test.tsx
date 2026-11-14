import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useCategoryStore } from '@/store/categoryStore';
import { MIN_N_CATEGORY, type BadgeLevel, type Category, type CategoryStat, type UserStat } from '@/types';

import { homeIdentity, IdentityLine, namedOnToday } from './IdentityLine';

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
    ).toEqual({ identity: 'Sharp in health', contrast: 'Tracker in finance', badge: 'sharp' });
    // Roadmap D27: a Guesser (fewer than 20 answered) is never the contrast.
    expect(
      homeIdentity(USER, [cat('finance', 'guesser', 17, 62), cat('health', 'sharp', 60, 96)]),
    ).toEqual({ identity: 'Sharp in health', contrast: null, badge: 'sharp' });
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
  // Playtest 2026-11-08b, finding 3: the line kept the old name until
  // something else re-rendered Today.
  it('follows a rename', () => {
    render(<IdentityLine userStat={USER} categoryStats={[cat('health', 'sharp', 60, 96)]} onPress={jest.fn()} />);
    expect(screen.getByText('Sharp in health')).toBeTruthy();
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
    expect(screen.getByText('Sharp in Running')).toBeTruthy();
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
    expect(line.props.accessibilityLabel).toBe('Sharp in health. Tracker in finance.');
    expect(line.props.accessibilityHint).toBe('Explains the badges');
    fireEvent.press(line);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for an all-Guesser user', () => {
    render(<IdentityLine userStat={USER} categoryStats={[cat('work', 'guesser')]} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-identity')).toBeNull();
  });
});

// D62: while the words are hidden, Today doesn't name a category the person named.
describe('IdentityLine with the words hidden', () => {
  it('names only categories under the app’s own words', () => {
    const { useSettingsStore } = jest.requireActual('@/store/settingsStore') as typeof import('@/store/settingsStore');
    useCategoryStore.setState({
      defs: [
        {
          id: 'c-divorce',
          user_id: 'u1',
          name: 'Divorce',
          icon: null,
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    useSettingsStore.setState({ hideTitles: true });
    try {
      render(
        <IdentityLine
          userStat={USER}
          categoryStats={[cat('c-divorce', 'sharp', 60, 96), cat('health', 'tracker')]}
          onPress={jest.fn()}
        />,
      );
      expect(screen.queryByText(/Divorce/)).toBeNull();
      expect(screen.getByTestId('home-identity')).toHaveTextContent(/health/);
    } finally {
      useSettingsStore.setState({ hideTitles: false });
      useCategoryStore.setState({ defs: [] });
    }
  });
});

// Code review of step 179: Today leaves off what the share card does.
describe('namedOnToday', () => {
  const stat = (category: 'health' | 'work') =>
    ({
      user_id: 'u1',
      category,
      predictions_made: 25,
      predictions_resolved: 25,
      calibration_score: 85,
      score_is_provisional: false,
      badge_level: 'forecaster',
    }) as const;

  it('keeps a built-in given only an icon, and drops a renamed one', () => {
    useCategoryStore.setState({
      defs: [
        {
          id: 'health',
          user_id: 'u1',
          name: null,
          icon: { kind: 'emoji', emoji: '❤️' },
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'work',
          user_id: 'u1',
          name: 'Recovery',
          icon: null,
          hidden: false,
          position: 1,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    try {
      const stats = [stat('health'), stat('work')];
      expect(namedOnToday(stats, true).map((c) => c.category)).toEqual(['health']);
      expect(namedOnToday(stats, false)).toHaveLength(2);
    } finally {
      useCategoryStore.setState({ defs: [] });
    }
  });
});

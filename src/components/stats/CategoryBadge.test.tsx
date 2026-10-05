import { render } from '@testing-library/react-native';

import { CategoryBadge, spokenHint } from '@/components/stats/CategoryBadge';
import type { CategoryStat, NextBadgeTarget } from '@/types';

function stat(overrides: Partial<CategoryStat> = {}): CategoryStat {
  return {
    user_id: 'u1',
    category: 'health',
    predictions_made: 10,
    predictions_resolved: 8,
    calibration_score: 60,
    score_is_provisional: true,
    badge_level: 'guesser',
    ...overrides,
  };
}

describe('CategoryBadge', () => {
  it('renders the current badge label for the level', () => {
    const view = render(
      <CategoryBadge stat={stat({ badge_level: 'forecaster' })} next={null} />,
    );
    expect(view.getByText('Forecaster')).toBeTruthy();
  });

  it('shows remaining resolutions when the next badge gates on count', () => {
    const next: NextBadgeTarget = {
      badge: 'tracker',
      needResolved: 20,
      needScore: null,
    };
    const view = render(
      <CategoryBadge stat={stat({ predictions_resolved: 8 })} next={next} />,
    );
    expect(view.getByText('12 more resolved → Tracker')).toBeTruthy();
  });

  it('shows the score target when the next badge gates on score', () => {
    const next: NextBadgeTarget = {
      badge: 'forecaster',
      needResolved: null,
      needScore: 70,
    };
    const view = render(
      <CategoryBadge
        stat={stat({ predictions_resolved: 25, calibration_score: 55 })}
        next={next}
      />,
    );
    expect(view.getByText('Score above 70 → Forecaster')).toBeTruthy();
  });

  it('celebrates when there is no next badge (top of the ladder)', () => {
    const view = render(
      <CategoryBadge
        stat={stat({ badge_level: 'oracle', predictions_resolved: 120 })}
        next={null}
      />,
    );
    expect(view.getByText('120 resolved · top badge reached')).toBeTruthy();
  });
});

// Roadmap step 43: one sentence, not three stops with an arrow read aloud.
describe('CategoryBadge — screen readers', () => {
  it('reads the row as one sentence', () => {
    const next: NextBadgeTarget = { badge: 'tracker', needResolved: 20, needScore: null };
    const view = render(<CategoryBadge stat={stat({ predictions_resolved: 17 })} next={next} />);
    expect(view.getByTestId('category-health').props.accessibilityLabel).toBe(
      'Health: Guesser. 3 more resolved to reach Tracker.',
    );
  });

  it('says the arrow and the dot in words', () => {
    expect(spokenHint('Score above 70 → Forecaster')).toBe('Score above 70 to reach Forecaster');
    expect(spokenHint('120 resolved · top badge reached')).toBe('120 resolved, top badge reached');
  });
});

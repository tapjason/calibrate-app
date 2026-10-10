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

  // Roadmap step 47: a Forecaster at 30 resolved with a score of 80 needs
  // both for Sharp; the count alone promised a badge resolving can't earn.
  it('names the score as well when both requirements are short', () => {
    const next: NextBadgeTarget = { badge: 'sharp', needResolved: 50, needScore: 85 };
    const view = render(
      <CategoryBadge
        stat={stat({
          badge_level: 'forecaster',
          predictions_resolved: 30,
          calibration_score: 80,
          score_is_provisional: false,
        })}
        next={next}
      />,
    );
    expect(view.getByText('20 more resolved and a score above 85 → Sharp')).toBeTruthy();
    expect(view.getByTestId('category-health').props.accessibilityLabel).toBe(
      'Health: Forecaster, score 80 from 30 resolved. 20 more resolved and a score above 85 to reach Sharp.',
    );
  });

  // Roadmap D28: a category's own score, once it's past MIN_N_CATEGORY.
  it("shows the category's score once it's unlocked", () => {
    const view = render(
      <CategoryBadge
        stat={stat({ predictions_resolved: 52, calibration_score: 87.4, score_is_provisional: false, badge_level: 'sharp' })}
        next={{ badge: 'oracle', needResolved: 100, needScore: 90 }}
      />,
    );
    expect(view.getByTestId('category-health-score')).toHaveTextContent('Score 87 · 52 resolved');
  });

  it('shows no score while it is provisional', () => {
    const view = render(
      <CategoryBadge
        stat={stat({ predictions_resolved: 12, calibration_score: 91 })}
        next={{ badge: 'tracker', needResolved: 20, needScore: null }}
      />,
    );
    expect(view.queryByTestId('category-health-score')).toBeNull();
    expect(view.queryByText(/91/)).toBeNull();
  });

  it('names only the count once the score already qualifies', () => {
    const next: NextBadgeTarget = { badge: 'sharp', needResolved: 50, needScore: 85 };
    const view = render(
      <CategoryBadge
        stat={stat({ badge_level: 'forecaster', predictions_resolved: 30, calibration_score: 92 })}
        next={next}
      />,
    );
    expect(view.getByText('20 more resolved → Sharp')).toBeTruthy();
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

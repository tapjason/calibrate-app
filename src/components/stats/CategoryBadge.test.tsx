import { render } from '@testing-library/react-native';

import { CategoryBadge, spokenHint } from '@/components/stats/CategoryBadge';
import { LensEmblem } from '@/components/ui/LensEmblem';
import { palettes } from '@/constants/theme';
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
    expect(view.getByText('Silver')).toBeTruthy();
  });

  // Roadmap D80: Platinum's chip is ink, and its emblem's face is ink too, so
  // on that chip the emblem takes the other appearance's tones. Light here.
  it("draws Platinum's emblem in tones that show on its ink chip", () => {
    const view = render(<CategoryBadge stat={stat({ badge_level: 'oracle' })} next={null} />);
    expect(view.getByText('Platinum')).toBeTruthy();
    expect(view.UNSAFE_getByType(LensEmblem).props.palette).toBe(palettes.dark);
    view.rerender(<CategoryBadge stat={stat({ badge_level: 'sharp' })} next={null} />);
    expect(view.getByText('Gold')).toBeTruthy();
    expect(view.UNSAFE_getByType(LensEmblem).props.palette).toBeUndefined();
  });

  // Roadmap D53 (blind playtest 2026-11-09b, finding 2).
  it('says the plain counts before the score unlocks, and not after', () => {
    const counts = { resolved: 9, happened: 7, mean_stated: 90 };
    const view = render(<CategoryBadge stat={stat({ predictions_resolved: 9 })} next={null} counts={counts} />);
    expect(view.getByTestId('category-health-counts')).toHaveTextContent(
      'You said about 90%, and 7 of 9 scored predictions happened. Too early to read.',
    );
    expect(view.getByTestId('category-health').props.accessibilityLabel).toMatch(/7 of 9 scored predictions happened\./);
    view.rerender(
      <CategoryBadge
        stat={stat({ predictions_resolved: 30, score_is_provisional: false, calibration_score: 80 })}
        next={null}
        counts={{ resolved: 30, happened: 20, mean_stated: 80 }}
      />,
    );
    expect(view.queryByTestId('category-health-counts')).toBeNull();
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
    expect(view.getByText('12 more scored answers to reach Bronze')).toBeTruthy();
  });

  // Web check, blind playtest 2026-11-10: "1 more scored answers".
  it('counts the last answer in the singular', () => {
    const next: NextBadgeTarget = { badge: 'tracker', needResolved: 20, needScore: null };
    const view = render(
      <CategoryBadge stat={stat({ predictions_resolved: 19 })} next={next} />,
    );
    expect(view.getByText('1 more scored answer to reach Bronze')).toBeTruthy();
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
    expect(view.getByText('Score above 70 at its low end to reach Silver')).toBeTruthy();
  });

  // Roadmap step 47: a Silver at 30 answered with a score of 80 needs
  // both for Gold; the count alone promised a badge resolving can't earn.
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
    expect(view.getByText('20 more scored answers and a score above 85 at its low end to reach Gold')).toBeTruthy();
    expect(view.getByTestId('category-health').props.accessibilityLabel).toBe(
      'Health: Silver, score 80 from 30 scored. 20 more scored answers and a score above 85 at its low end to reach Gold.',
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
    expect(view.getByTestId('category-health-score')).toHaveTextContent('Score 87, 52 scored');
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
    expect(view.getByText('20 more scored answers to reach Gold')).toBeTruthy();
  });

  it('celebrates when there is no next badge (top of the ladder)', () => {
    const view = render(
      <CategoryBadge
        stat={stat({ badge_level: 'oracle', predictions_resolved: 120 })}
        next={null}
      />,
    );
    expect(view.getByText('120 scored, top badge reached')).toBeTruthy();
  });
});

// Roadmap step 43: one sentence, not three stops with an arrow read aloud.
describe('CategoryBadge — screen readers', () => {
  it('reads the row as one sentence', () => {
    const next: NextBadgeTarget = { badge: 'tracker', needResolved: 20, needScore: null };
    const view = render(<CategoryBadge stat={stat({ predictions_resolved: 17 })} next={next} />);
    expect(view.getByTestId('category-health').props.accessibilityLabel).toBe(
      'Health: Getting started. 3 more scored answers to reach Bronze.',
    );
  });

  // Roadmap D33: the hint is written in words, so it is spoken as written.
  it('speaks the hint as written', () => {
    expect(spokenHint('Score above 70 at its low end to reach Silver')).toBe('Score above 70 at its low end to reach Silver');
    expect(spokenHint('120 scored, top badge reached')).toBe('120 scored, top badge reached');
  });
});

// Roadmap D35: a category's score shows its give-or-take, and when only the
// give-or-take keeps it from the next tier, the hint says so.
describe('CategoryBadge with a give-or-take', () => {
  it('says the give-or-take beside an unlocked score', () => {
    const view = render(
      <CategoryBadge
        stat={stat({ predictions_resolved: 22, calibration_score: 93.4, score_is_provisional: false, badge_level: 'tracker' })}
        next={{ badge: 'sharp', needResolved: 50, needScore: 85 }}
        giveOrTake={6}
      />,
    );
    expect(view.getByTestId('category-health-score')).toHaveTextContent(
      'Score 93, give or take 6, from 22 scored',
    );
    expect(view.getByTestId('category-health').props.accessibilityLabel).toMatch(
      /score 93 give or take 6 from 22 scored/,
    );
  });

  it('asks for the score at its low end when only the give-or-take is short', () => {
    const view = render(
      <CategoryBadge
        stat={stat({
          predictions_resolved: 60,
          calibration_score: 87,
          score_is_provisional: false,
          badge_level: 'forecaster',
        })}
        next={{ badge: 'sharp', needResolved: 50, needScore: 85 }}
        giveOrTake={4}
      />,
    );
    expect(view.getByTestId('category-health-hint')).toHaveTextContent(
      /^Score above 85 at its low end to.reach.Gold$/,
    );
  });
});

// "Hide the words" (D61, D62) was removed on 2026-11-25: a badge row names
// the category as the person named it, with the icon they chose.
describe('CategoryBadge names every category (2026-11-25)', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { useCategoryStore } = require('@/store/categoryStore') as typeof import('@/store/categoryStore');
  /* eslint-enable @typescript-eslint/no-var-requires */
  afterEach(() => {
    useCategoryStore.setState({ defs: [] });
  });

  it('shows a name the person gave, with their icon', () => {
    useCategoryStore.setState({
      defs: [
        {
          id: 'health',
          user_id: 'u1',
          name: 'Divorce',
          icon: { kind: 'emoji', emoji: '🏃' },
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    const view = render(<CategoryBadge stat={stat()} next={null} />);
    expect(view.getByText('Divorce')).toBeTruthy();
    expect(view.queryByText('Your own category')).toBeNull();
    expect(view.getByTestId('category-icon-emoji', { includeHiddenElements: true })).toBeTruthy();
  });
});

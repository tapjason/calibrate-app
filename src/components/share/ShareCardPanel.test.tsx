import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';
import type { CategoryStat, UserStat, WarmupResult } from '@/types';

import { FRIEND_SQUARES, FRIEND_WARMUP, ShareCardPanel, SQUARES_LATER } from './ShareCardPanel';

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 88.4,
  total_predictions: 60,
  total_resolved: 55,
  current_streak: 3,
  rating_is_provisional: false,
};

const CATEGORY_STATS: CategoryStat[] = [
  {
    user_id: 'u1',
    category: 'health',
    predictions_made: 30,
    predictions_resolved: 30,
    calibration_score: 88,
    score_is_provisional: false,
    badge_level: 'sharp',
  },
  {
    user_id: 'u1',
    category: 'finance',
    predictions_made: 25,
    predictions_resolved: 25,
    calibration_score: 52,
    score_is_provisional: false,
    badge_level: 'tracker',
  },
];

function shareDeps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    capture: jest.fn(async () => 'file:///tmp/card.png'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => undefined),
    ...over,
  };
}

function seedStats(
  userStat: UserStat | null,
  categoryStats: CategoryStat[] = [],
): void {
  useStatsStore.setState({
    userStat,
    categoryStats,
    calibration: { rating: 0, buckets: [] },
    ratingRange: null,
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  useWarmupStore.setState({ result: null });
  // The card's shape and hidden categories are kept between visits.
  useSettingsStore.setState({ cardFormat: 'post', cardHiddenCategories: [] });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __setShareDepsForTests(shareDeps());
});

afterEach(() => {
  __setShareDepsForTests(null);
  warn.mockRestore();
});

describe('ShareCardPanel', () => {
  it('prompts for data instead of rendering an empty card', () => {
    seedStats(null);
    render(<ShareCardPanel />);

    expect(screen.getByTestId('share-empty')).toBeTruthy();
    expect(screen.queryByTestId('identity-card')).toBeNull();
  });

  it('renders the identity card with the best/worst contrast', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    expect(screen.getByTestId('identity-card')).toBeTruthy();
    expect(screen.getByTestId('card-identity')).toHaveTextContent('Sharp in health');
    expect(screen.getByTestId('card-contrast')).toHaveTextContent('Tracker in finance');
    expect(screen.getByTestId('card-badge-health')).toBeTruthy();
    expect(screen.getByTestId('card-badge-finance')).toBeTruthy();
  });

  it('shows the rating on the card once it has settled', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    expect(
      screen.getByText('Calibration 88/100 from 55 scored answers'),
    ).toBeTruthy();
  });

  // Decided 2026-11-03: the card carries the rating's give-or-take.
  it('prints the give-or-take beside the rating', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    useStatsStore.setState({ ratingRange: { giveOrTake: 4, low: 84, high: 92 } });
    render(<ShareCardPanel />);

    expect(
      screen.getByText('Calibration 88/100, give or take 4, from 55 scored answers'),
    ).toBeTruthy();
  });

  // The card is the most public thing the app produces — a provisional number
  // must not travel on it (CLAUDE.md).
  it('replaces a provisional rating with progress toward the threshold', () => {
    seedStats(
      { ...USER_STAT, rating_is_provisional: true, total_resolved: 8 },
      CATEGORY_STATS,
    );
    render(<ShareCardPanel />);

    expect(
      screen.getByText('12 more scored answers until my calibration unlocks'),
    ).toBeTruthy();
    expect(screen.queryByText(/Calibration 88/)).toBeNull();
  });

  it('captures the card and opens the share sheet', async () => {
    const deps = shareDeps();
    __setShareDepsForTests(deps);
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-button'));

    await waitFor(() => {
      expect(deps.share).toHaveBeenCalledWith('file:///tmp/card.png');
    });
    expect(screen.queryByTestId('share-message')).toBeNull();
  });

  it('suggests a screenshot when the platform has no share sheet', async () => {
    __setShareDepsForTests(shareDeps({ isAvailable: jest.fn(async () => false) }));
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-button'));

    await waitFor(() => {
      expect(screen.getByTestId('share-message')).toBeTruthy();
    });
    expect(screen.getByText(/screenshot it instead/)).toBeTruthy();
  });

  it('surfaces a retry hint when capture fails, without crashing', async () => {
    __setShareDepsForTests(
      shareDeps({
        capture: jest.fn(async () => {
          throw new Error('view not mounted');
        }),
      }),
    );
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-button'));

    await waitFor(() => {
      expect(screen.getByText(/Try again/)).toBeTruthy();
    });
    expect(screen.getByTestId('identity-card')).toBeTruthy();
  });
});

// DESIGN_SYSTEM rule 0.10: Share is never empty — the Warmup is the Day-0 card.
describe('ShareCardPanel — Day 0', () => {
  const WARMUP: WarmupResult = {
    answered: 10,
    mean_confidence: 77,
    accuracy: 0.5,
    mini_score: 70,
    direction: 'overconfident',
    buckets: [],
  };

  it('shows the warm-up card before any real prediction resolves', () => {
    seedStats(null);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);

    expect(screen.getByTestId('warmup-card')).toBeTruthy();
    expect(screen.getByText('5 of 10 right')).toBeTruthy();
    expect(screen.getByText('I was 77% sure. How sure are you?')).toBeTruthy();
    expect(screen.queryByTestId('share-empty')).toBeNull();
  });

  it('shares the warm-up card like any other', async () => {
    const deps = shareDeps();
    __setShareDepsForTests(deps);
    seedStats(null);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-button'));
    await waitFor(() => {
      expect(deps.share).toHaveBeenCalled();
    });
  });

  it('prefers the real identity card once there is one', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);

    expect(screen.getByTestId('identity-card')).toBeTruthy();
    expect(screen.queryByTestId('warmup-card')).toBeNull();
  });

  // Blind playtest 2026-11-13c, finding 3: the Warm-up card was the most
  // shared thing, and gone after the first answer. It stays one tap away.
  it('keeps the warm-up card one tap away once the category card is there', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-switch-card'));
    expect(screen.getByTestId('warmup-card')).toBeTruthy();
    expect(screen.queryByTestId('identity-card')).toBeNull();
    // The text share is the category card's; it goes while the warm-up shows.
    expect(screen.queryByTestId('share-text-button')).toBeNull();
    expect(screen.getByTestId('share-switch-card')).toHaveTextContent('Show my category card');
    // Their own squares exist or are coming: no "yours come once…" here.
    expect(screen.queryByTestId('share-friend-squares')).toBeNull();

    fireEvent.press(screen.getByTestId('share-switch-card'));
    expect(screen.getByTestId('identity-card')).toBeTruthy();
    expect(screen.queryByTestId('share-friend-squares')).toBeNull();
  });

  // Step 181 (blind playtest 2026-11-14, finding 4): in week one the category
  // card is "Calibrating" with nothing on it, and every early tester shared
  // the Warm-up card instead.
  it('leads with the warm-up card until the rating unlocks', () => {
    seedStats({ ...USER_STAT, rating_is_provisional: true, total_resolved: 3 }, CATEGORY_STATS);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);

    expect(screen.getByTestId('warmup-card')).toBeTruthy();
    expect(screen.queryByTestId('identity-card')).toBeNull();
    // A friend's card is explained while there's no rated card of one's own.
    expect(screen.getByTestId('share-friend-open')).toBeTruthy();
    expect(screen.getByTestId('share-switch-card')).toHaveTextContent('Show my category card');

    fireEvent.press(screen.getByTestId('share-switch-card'));
    expect(screen.getByTestId('identity-card')).toBeTruthy();
    expect(screen.getByText('17 more scored answers until my calibration unlocks')).toBeTruthy();
    expect(screen.queryByTestId('share-friend-open')).toBeNull();
    fireEvent.press(screen.getByTestId('share-switch-card'));
    expect(screen.getByTestId('warmup-card')).toBeTruthy();
  });

  it('shows the category card before the rating when there was no warm-up', () => {
    seedStats({ ...USER_STAT, rating_is_provisional: true, total_resolved: 3 }, CATEGORY_STATS);
    render(<ShareCardPanel />);
    expect(screen.getByTestId('identity-card')).toBeTruthy();
    expect(screen.queryByTestId('share-switch-card')).toBeNull();
  });

  it('names its Shape choice for a screen reader', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    expect(screen.getByLabelText('Shape').props.accessibilityRole).toBe('radiogroup');
  });

  it('offers no switch without a warm-up', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    expect(screen.queryByTestId('share-switch-card')).toBeNull();
  });

  // Blind playtest 2026-11-13c, finding 6: a friend's squares, explained
  // where someone who came from one first looks.
  it("explains a friend's squares under the warm-up card", () => {
    seedStats(null);
    useWarmupStore.setState({ result: WARMUP });
    render(<ShareCardPanel />);
    // Folded behind "Got a friend's card?" (D62).
    expect(screen.queryByTestId('share-friend-squares')).toBeNull();
    fireEvent.press(screen.getByTestId('share-friend-open'));
    expect(screen.getByTestId('share-friend-squares')).toHaveTextContent(
      `${FRIEND_WARMUP} ${FRIEND_SQUARES}`,
    );
    // The card that travels first, and who was nearer their word (step 181).
    expect(FRIEND_WARMUP).toBe(
      'A friend' + "'" + 's warm-up card sets what they got beside what they said: "8 of 10 right. I was 90% sure." means they expected about 9 of 10 and got 8. The closer the two, the better their numbers fit, whoever got more right.',
    );
    expect(FRIEND_SQUARES).toBe(
      'A friend' + "'" + 's score is out of 100: 100 minus how far, range by range and on average, what they said was from how often it happened. "Give or take" is how far luck could move it. The squares are their five ranges of how sure, 0–20% up to 80–100%, low to high: 🟩 no clear lean · 🟧 too sure · 🟦 too cautious · ⬜ under 10 answers. Yours come once your rating unlocks and a range has 10 scored answers.',
    );
  });

  it('offers the warm-up when there is nothing at all', () => {
    seedStats(null);
    const onTakeWarmup = jest.fn();
    render(<ShareCardPanel onTakeWarmup={onTakeWarmup} />);

    fireEvent.press(screen.getByText('Take the warm-up'));
    expect(onTakeWarmup).toHaveBeenCalled();
  });
});

describe('ShareCardPanel — text share', () => {
  it('shares a plain-text version of the card', async () => {
    const shareTextFn = jest.fn(async () => undefined);
    __setShareDepsForTests({ ...shareDeps(), shareText: shareTextFn });
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    fireEvent.press(screen.getByTestId('share-text-button'));
    await waitFor(() => expect(shareTextFn).toHaveBeenCalled());
    const [message] = shareTextFn.mock.calls[0] as unknown as [string];
    expect(message).toContain('Sharp in health · Tracker in finance');
  });
});

describe('ShareCardPanel — shape and contents', () => {
  // Roadmap step 53: one canvas on every phone, 3:4 and 9:16.
  it('switches between the Post and Story canvases', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    const flat = () => StyleSheet.flatten(screen.getByTestId('identity-card').props.style);
    expect(flat()).toMatchObject({ width: 360, height: 480 });
    fireEvent.press(screen.getByTestId('share-format-story'));
    expect(flat()).toMatchObject({ width: 360, height: 640 });
  });

  it('scales the canvas to the width it has, and waits unseen until it knows it', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    const preview = () => screen.getByTestId('card-preview');
    expect(StyleSheet.flatten(preview().props.style).opacity).toBe(0);

    // A 375pt phone: 343pt for the card after the screen's padding.
    fireEvent(preview(), 'layout', { nativeEvent: { layout: { width: 343, height: 0 } } });
    const style = StyleSheet.flatten(preview().props.style);
    expect(style.opacity).toBeUndefined();
    expect(style.height).toBeCloseTo(480 * (343 / 360));
    const canvas = StyleSheet.flatten(screen.getByTestId('card-preview-canvas').props.style);
    expect(canvas.transform).toEqual([{ scale: 343 / 360 }]);
    expect(canvas.transformOrigin).toBe('top left');
  });

  // Step 179 (blind playtest 2026-11-13e, runs 1 and 4).
  it('keeps a category the person named off the card while the words are hidden', () => {
    const { useCategoryStore } = jest.requireActual('@/store/categoryStore') as typeof import('@/store/categoryStore');
    seedStats(USER_STAT, CATEGORY_STATS);
    const named = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0)[0]!.category;
    useCategoryStore.setState({
      defs: [
        {
          id: named,
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
      render(<ShareCardPanel />);
      expect(screen.queryByText(/Divorce/)).toBeNull();
      expect(screen.queryByTestId(`share-toggle-${named}`)).toBeNull();
      expect(screen.getByTestId('share-own-kept-off')).toBeTruthy();
      // Not stored as unticked: it comes back when the switch goes off.
      expect(useSettingsStore.getState().cardHiddenCategories).toEqual([]);
    } finally {
      useSettingsStore.setState({ hideTitles: false });
      useCategoryStore.setState({ defs: [] });
    }
  });

  // Code review of step 179: nothing comes back, and the card doesn't vanish.
  describe('with the words hidden', () => {
    const { useCategoryStore } = jest.requireActual('@/store/categoryStore') as typeof import('@/store/categoryStore');
    const def = (id: 'health' | 'finance', over: { name?: string | null; icon?: { kind: 'emoji'; emoji: string } | null }) => ({
      id,
      user_id: 'u1',
      name: over.name ?? null,
      icon: over.icon ?? null,
      hidden: false,
      position: 0,
      created_at: '2026-11-01T00:00:00.000Z',
    });
    afterEach(() => {
      useSettingsStore.setState({ hideTitles: false, cardHiddenCategories: [] });
      useCategoryStore.setState({ defs: [] });
    });

    it('keeps the category card when every category is the person\'s own', () => {
      seedStats(USER_STAT, CATEGORY_STATS);
      useCategoryStore.setState({
        defs: [def('health', { name: 'Divorce' }), def('finance', { name: 'Rent' })],
      });
      useSettingsStore.setState({ hideTitles: true });
      render(<ShareCardPanel />);
      expect(screen.getByTestId('card-identity')).toHaveTextContent('Calibration 88/100');
      expect(screen.getByText('2 categories not shown (still counted)')).toBeTruthy();
      expect(screen.queryByText(/Divorce|Rent/)).toBeNull();
      expect(screen.getByTestId('share-own-kept-off')).toBeTruthy();
      expect(screen.queryByTestId('share-empty')).toBeNull();
    });

    it('never puts back a category the person unticked', () => {
      seedStats(USER_STAT, CATEGORY_STATS);
      useCategoryStore.setState({ defs: [def('health', { name: 'Divorce' })] });
      useSettingsStore.setState({ hideTitles: true, cardHiddenCategories: ['finance'] });
      render(<ShareCardPanel />);
      expect(screen.queryByText(/finance/)).toBeNull();
      expect(screen.getByText('2 categories not shown (still counted)')).toBeTruthy();
      // Its chip stays, so it can come back on.
      const finance = screen.getByTestId('share-toggle-finance');
      expect(finance.props.accessibilityState).toMatchObject({ checked: false });
      fireEvent.press(finance);
      expect(useSettingsStore.getState().cardHiddenCategories).toEqual([]);
    });

    it('lets the one category left come off as well (owner, 2026-11-14)', () => {
      seedStats(USER_STAT, CATEGORY_STATS);
      const onFile = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0).map((c) => c.category);
      const [left, ...named] = onFile;
      useCategoryStore.setState({
        defs: named.map((id) => def(id as 'health' | 'finance', { name: `Mine ${id}` })),
      });
      useSettingsStore.setState({ hideTitles: true });
      render(<ShareCardPanel />);
      fireEvent.press(screen.getByTestId(`share-toggle-${left}`));
      expect(screen.queryAllByTestId(/^card-badge-/)).toHaveLength(0);
      expect(useSettingsStore.getState().cardHiddenCategories).toEqual([left]);
    });

    it('keeps a built-in that has only an icon: the card draws none', () => {
      seedStats(USER_STAT, CATEGORY_STATS);
      useCategoryStore.setState({ defs: [def('health', { icon: { kind: 'emoji', emoji: '🏃' } })] });
      useSettingsStore.setState({ hideTitles: true });
      render(<ShareCardPanel />);
      expect(screen.getByTestId('card-identity')).toHaveTextContent('Sharp in health');
      expect(screen.queryByTestId('share-own-kept-off')).toBeNull();
    });
  });

  // Every one can come off (owner, 2026-11-14): the card keeps the rating.
  it('leaves categories off the card, the last one too', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    const categories = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0).map(
      (c) => c.category,
    );
    const [first, ...rest] = categories;

    expect(screen.queryByTestId('card-hidden')).toBeNull();
    fireEvent.press(screen.getByTestId(`share-toggle-${first}`));
    expect(screen.queryByTestId(`card-badge-${first}`)).toBeNull();
    // Said on the card (decided 2026-11-03): a curated card isn't the record.
    expect(screen.getByTestId('card-hidden')).toHaveTextContent('1 category not shown (still counted)');

    for (const c of rest) fireEvent.press(screen.getByTestId(`share-toggle-${c}`));
    expect(screen.queryAllByTestId(/^card-badge-/)).toHaveLength(0);
    expect(screen.getByTestId('card-identity')).toHaveTextContent('Calibration 88/100');
    expect(screen.getByTestId('card-hidden')).toHaveTextContent(
      `${categories.length} categories not shown (still counted)`,
    );
    // Each chip stays, so any can come back on.
    fireEvent.press(screen.getByTestId(`share-toggle-${first}`));
    expect(screen.getByTestId(`card-badge-${first}`)).toBeTruthy();
  });

  it('lets a single category come off and back on', () => {
    const only = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0).slice(0, 1);
    seedStats(USER_STAT, only);
    render(<ShareCardPanel />);
    const chip = screen.getByTestId(`share-toggle-${only[0].category}`);
    fireEvent.press(chip);
    expect(screen.queryAllByTestId(/^card-badge-/)).toHaveLength(0);
    expect(screen.getByTestId('card-hidden')).toHaveTextContent('1 category not shown (still counted)');
    fireEvent.press(screen.getByTestId(`share-toggle-${only[0].category}`));
    expect(screen.getAllByTestId(/^card-badge-/)).toHaveLength(1);
  });

  // Blind playtest 2026-11-01 (run 5): both reset each time Share opened.
  it('keeps the shape and the categories left off for the next visit', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    const first = CATEGORY_STATS.find((c) => c.predictions_resolved > 0)!.category;
    const visit = render(<ShareCardPanel />);
    fireEvent.press(screen.getByTestId('share-format-story'));
    fireEvent.press(screen.getByTestId(`share-toggle-${first}`));
    visit.unmount();

    render(<ShareCardPanel />);
    expect(StyleSheet.flatten(screen.getByTestId('identity-card').props.style)).toMatchObject({
      height: 640,
    });
    expect(screen.queryByTestId(`card-badge-${first}`)).toBeNull();
    expect(screen.getByTestId(`share-toggle-${first}`).props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  // A kept choice that leaves every category off is kept (owner,
  // 2026-11-14): it used to put them all back.
  it('keeps every category off when that was the choice', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    const onFile = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0).map((c) => c.category);
    useSettingsStore.setState({ cardHiddenCategories: onFile });
    render(<ShareCardPanel />);
    expect(screen.queryAllByTestId(/^card-badge-/)).toHaveLength(0);
    expect(screen.getByTestId('card-hidden')).toHaveTextContent(`${onFile.length} categories not shown (still counted)`);
  });
});

// Roadmap D60 (c): before the squares exist, when they come and where they're
// explained (blind playtest 2026-11-13b, run 5).
describe('ShareCardPanel — the squares, before they come', () => {
  it('says when the text share gets its squares while no range has 10', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    expect(screen.getByTestId('share-squares-later')).toHaveTextContent(SQUARES_LATER);
  });

  it('says nothing once a range has 10', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    useStatsStore.setState({
      calibration: {
        rating: 88,
        buckets: [
          {
            low: 60,
            high: 80,
            total_resolved: 12,
            resolved_yes: 8,
            stated_confidence_mean: 70,
            actual_rate: 8 / 12,
            direction: 'calibrated',
          } as never,
        ],
      },
    });
    render(<ShareCardPanel />);
    expect(screen.queryByTestId('share-squares-later')).toBeNull();
  });
});

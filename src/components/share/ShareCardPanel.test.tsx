import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';
import type { CategoryStat, UserStat, WarmupResult } from '@/types';

import { ShareCardPanel } from './ShareCardPanel';

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
    badge_level: 'guesser',
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
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  useWarmupStore.setState({ result: null });
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
    expect(screen.getByTestId('card-contrast')).toHaveTextContent('Guesser in finance');
    expect(screen.getByTestId('card-badge-health')).toBeTruthy();
    expect(screen.getByTestId('card-badge-finance')).toBeTruthy();
  });

  it('shows the rating on the card once it has settled', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);

    expect(
      screen.getByText('Calibration 88/100 · 55 predictions resolved'),
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
      screen.getByText('12 more resolutions until my calibration unlocks'),
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
    expect(screen.getByText('I run hot')).toBeTruthy();
    expect(screen.getByText('77% sure, 50% right')).toBeTruthy();
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
    expect(message).toContain('Sharp in health · Guesser in finance');
  });
});

describe('ShareCardPanel — shape and contents', () => {
  it('switches between the Post and Story shapes', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    const flat = () => StyleSheet.flatten(screen.getByTestId('identity-card').props.style);
    expect(flat().aspectRatio).toBeCloseTo(3 / 4);
    fireEvent.press(screen.getByTestId('share-format-story'));
    expect(flat().aspectRatio).toBeCloseTo(9 / 16);
  });

  it('leaves a category off the card, but never all of them', () => {
    seedStats(USER_STAT, CATEGORY_STATS);
    render(<ShareCardPanel />);
    const categories = CATEGORY_STATS.filter((c) => c.predictions_resolved > 0).map(
      (c) => c.category,
    );
    const [first, ...rest] = categories;

    fireEvent.press(screen.getByTestId(`share-toggle-${first}`));
    expect(screen.queryByTestId(`card-badge-${first}`)).toBeNull();

    for (const c of rest) fireEvent.press(screen.getByTestId(`share-toggle-${c}`));
    // The last one standing can't be switched off.
    expect(screen.getAllByTestId(/^card-badge-/)).toHaveLength(1);
  });
});

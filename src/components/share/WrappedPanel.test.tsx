import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL, type Prediction } from '@/types';

import { haptics } from '@/components/ui/haptics';

import { __resetRevealedWeeksForTests, WrappedPanel } from './WrappedPanel';

jest.mock('@/components/ui/haptics', () => ({
  haptics: {
    commit: jest.fn(),
    detent: jest.fn(),
    resolve: jest.fn(),
    reveal: jest.fn(),
    unlock: jest.fn(),
  },
}));

let seq = 0;

/** Resolved today, so it always lands inside the seven-day window. */
function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  const now = new Date().toISOString();
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Prediction ${seq}`,
    category: 'work',
    confidence: 80,
    created_at: now,
    due_date: now,
    status: 'resolved_yes',
    resolved_at: now,
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

function run(n: number, yes: number, over: Partial<Prediction> = {}): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    prediction({ status: i < yes ? 'resolved_yes' : 'resolved_no', ...over }),
  );
}

function shareDeps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    capture: jest.fn(async () => 'file:///tmp/wrapped.png'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => undefined),
    ...over,
  };
}

function seed(resolved: Prediction[]): void {
  usePredictionStore.setState({ pending: [], resolved });
}

function seedOverall(totalResolved: number): void {
  useStatsStore.setState({
    userStat: {
      user_id: 'u1',
      calibration_rating: 70,
      total_predictions: totalResolved,
      total_resolved: totalResolved,
      current_streak: 0,
      rating_is_provisional: totalResolved < MIN_N_OVERALL,
    },
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  seq = 0;
  __resetRevealedWeeksForTests();
  jest.mocked(haptics.reveal).mockClear();
  useStatsStore.setState({ userStat: null, categoryStats: [], nextBadges: {} });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __setShareDepsForTests(shareDeps());
});

afterEach(() => {
  __setShareDepsForTests(null);
  warn.mockRestore();
});

describe('WrappedPanel — an empty week (roadmap step 34)', () => {
  const due = (days: number, id: string): Prediction => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    at.setHours(12, 0, 0, 0);
    return { ...prediction({ id }), status: 'pending', resolved_at: null, due_date: at.toISOString() };
  };

  it('says what is on the way instead of "nothing"', () => {
    usePredictionStore.setState({
      pending: [due(2, 'soon'), due(5, 'later'), due(30, 'next-month')],
      resolved: [],
    });
    render(<WrappedPanel span="week" />);
    expect(screen.getByText('2 on the way')).toBeTruthy();
    expect(screen.getByText(/They come due within the week/)).toBeTruthy();
    expect(screen.queryByText('Nothing resolved yet')).toBeNull();
  });

  it('keeps the plain empty copy with nothing due this week, and for the year', () => {
    usePredictionStore.setState({ pending: [due(30, 'next-month')], resolved: [] });
    const week = render(<WrappedPanel span="week" />);
    expect(screen.getByText('Nothing resolved yet')).toBeTruthy();
    week.unmount();

    usePredictionStore.setState({ pending: [due(2, 'soon')], resolved: [] });
    render(<WrappedPanel span="year" />);
    expect(screen.getByText('Nothing resolved yet')).toBeTruthy();
  });
});

describe('WrappedPanel', () => {
  it('tells an empty-week story instead of rendering blank', () => {
    seed([]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText('Nothing resolved yet')).toBeTruthy();
    expect(screen.getByText(/Log a prediction and the story starts/)).toBeTruthy();
  });

  it('disables sharing when there is nothing to show', () => {
    seed([]);
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));
    expect(screen.queryByTestId('wrapped-share-message')).toBeNull();
  });

  it('summarizes the window in counts', () => {
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    expect(screen.getByText('4 resolved')).toBeTruthy();
    // Four at 80% expect 3.2; three happened (roadmap step 48).
    expect(screen.getByTestId('wrapped-expected')).toHaveTextContent(
      '3 happened. You expected about\u00A03.',
    );
    expect(screen.queryByText(/came in/)).toBeNull();
    // Read as one sentence by screen readers.
    expect(screen.getByTestId('wrapped-stat').props.accessibilityLabel).toBe(
      '4 predictions resolved. 3 happened. You expected about\u00A03.',
    );
  });

  // CLAUDE.md: no verdict on data too thin to support one.
  it('withholds the calibration read while the window is provisional', () => {
    seed(run(4, 2));
    render(<WrappedPanel span="week" />);

    expect(screen.queryByTestId('wrapped-verdict')).toBeNull();
    expect(screen.getByTestId('wrapped-provisional')).toBeTruthy();
  });

  // A week almost never reaches the minimum, so it must not ask for 20
  // resolutions in seven days; it points at the overall unlock instead.
  it('shows overall progress on a provisional week while the rating is locked', () => {
    seed(run(4, 2));
    seedOverall(12);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/12 of 20 resolutions toward your first calibration score/)).toBeTruthy();
    expect(screen.queryByText(/more resolutions and this/)).toBeNull();
  });

  it('points at the all-time score once the rating has unlocked', () => {
    seed(run(4, 2));
    seedOverall(MIN_N_OVERALL + 10);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/A week is too short for a verdict/)).toBeTruthy();
  });

  it('keeps the countdown for a provisional year', () => {
    seed(run(4, 2));
    render(<WrappedPanel span="year" />);

    expect(screen.getByText(/16 more resolutions and this year earns/)).toBeTruthy();
  });

  it('gives a factual receipt from the busiest bucket, even while provisional', () => {
    seed([...run(3, 2, { confidence: 90 }), prediction({ confidence: 50 })]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-receipt')).toBeTruthy();
    expect(screen.getByText('You said 80–100% 3 times. 2 of 3 happened.')).toBeTruthy();
  });

  it('gives the verdict once the window clears the minimum', () => {
    seed(run(MIN_N_OVERALL, 10));
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-verdict')).toBeTruthy();
    expect(screen.queryByTestId('wrapped-provisional')).toBeNull();
    expect(screen.getByText(/You ran overconfident/)).toBeTruthy();
  });

  it('features the boldest call and the surest miss', () => {
    seed([
      prediction({ confidence: 95, status: 'resolved_yes', title: 'Ship the beta' }),
      prediction({ confidence: 90, status: 'resolved_no', title: 'Close the deal' }),
    ]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-boldest-hit')).toBeTruthy();
    // Titles stay off the card until the user asks for them.
    expect(screen.queryByText(/Ship the beta/)).toBeNull();
    expect(screen.queryByText(/Close the deal/)).toBeNull();

    fireEvent.press(screen.getByTestId('wrapped-titles-toggle'));
    expect(screen.getByText(/Ship the beta/)).toBeTruthy();
    expect(screen.getByText(/Close the deal/)).toBeTruthy();
  });

  it('credits honest-uncertainty calls', () => {
    seed([
      prediction({ confidence: 50, integrity_bonus: true }),
      prediction({ confidence: 60, integrity_bonus: true }),
    ]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/2 honest-uncertainty calls logged/)).toBeTruthy();
  });

  it('nudges toward coin-flip calls when there were none', () => {
    seed(run(3, 2));
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/No coin-flip calls this time/)).toBeTruthy();
  });

  it('captures the recap and opens the share sheet', async () => {
    const deps = shareDeps();
    __setShareDepsForTests(deps);
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));

    await waitFor(() => {
      expect(deps.share).toHaveBeenCalledWith('file:///tmp/wrapped.png');
    });
  });

  it('surfaces a hint when sharing is unavailable, without crashing', async () => {
    __setShareDepsForTests(shareDeps({ isAvailable: jest.fn(async () => false) }));
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));

    await waitFor(() => {
      expect(screen.getByText(/screenshot it instead/)).toBeTruthy();
    });
    expect(screen.getByTestId('wrapped-card')).toBeTruthy();
  });

  it('shows the badge closest to hand, with a blueprint emblem', () => {
    seed(run(4, 3));
    useStatsStore.setState({
      categoryStats: [
        {
          user_id: 'u1',
          category: 'health',
          predictions_made: 17,
          predictions_resolved: 17,
          calibration_score: 60,
          score_is_provisional: false,
          badge_level: 'guesser',
        },
      ],
      nextBadges: { health: { badge: 'tracker', needResolved: 20, needScore: null } },
    });
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-next-badge')).toBeTruthy();
    expect(screen.getByText('Tracker in health: 3 to go')).toBeTruthy();
    expect(screen.getByTestId('lens-tracker-progress', { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides the badge row when there is nothing to work toward', () => {
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    expect(screen.queryByTestId('wrapped-next-badge')).toBeNull();
  });

  it('renders the yearly window too', () => {
    seed(run(3, 2));
    render(<WrappedPanel span="year" />);

    expect(screen.getByTestId('wrapped-panel-year')).toBeTruthy();
    expect(screen.getByText('Your year in predictions')).toBeTruthy();
  });
});

// DESIGN_SYSTEM §6.2: weekly Wrapped gets `reveal`, once, on the panel.
describe('WrappedPanel — weekly reveal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lands with the reveal haptic once a day, not on every visit', () => {
    seed(run(4, 3));
    const first = render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).toHaveBeenCalledTimes(1);
  });

  it('does not perform for an empty week or for the year', () => {
    seed([]);
    const empty = render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    empty.unmount();

    seed(run(4, 3));
    render(<WrappedPanel span="year" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).not.toHaveBeenCalled();
  });
});

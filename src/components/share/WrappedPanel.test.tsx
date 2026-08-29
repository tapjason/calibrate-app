import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import { usePredictionStore } from '@/store/predictionStore';
import { MIN_N_OVERALL, type Prediction } from '@/types';

import { WrappedPanel } from './WrappedPanel';

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

let warn: jest.SpyInstance;

beforeEach(() => {
  seq = 0;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __setShareDepsForTests(shareDeps());
});

afterEach(() => {
  __setShareDepsForTests(null);
  warn.mockRestore();
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

    expect(screen.getByText('4 predictions resolved · 75% came in')).toBeTruthy();
  });

  // CLAUDE.md: no verdict on data too thin to support one.
  it('withholds the calibration read while the window is provisional', () => {
    seed(run(4, 2));
    render(<WrappedPanel span="week" />);

    expect(screen.queryByTestId('wrapped-verdict')).toBeNull();
    expect(screen.getByTestId('wrapped-provisional')).toBeTruthy();
    expect(screen.getByText(/16 more resolutions/)).toBeTruthy();
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

  it('renders the yearly window too', () => {
    seed(run(3, 2));
    render(<WrappedPanel span="year" />);

    expect(screen.getByTestId('wrapped-panel-year')).toBeTruthy();
    expect(screen.getByText('Your year in predictions')).toBeTruthy();
  });
});

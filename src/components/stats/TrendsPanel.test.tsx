import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setFileExportDepsForTests, type FileExportDeps } from '@/export/file';
import { buildTrendSummary } from '@/engine/trends';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import { FREE_ENTITLEMENT, type Category, type Prediction } from '@/types';

import { TrendsPanel } from './TrendsPanel';

let seq = 0;
function p(
  confidence: number,
  yes: boolean,
  resolvedAt: string,
  category: Category = 'work',
): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: 'x',
    category,
    confidence,
    created_at: resolvedAt,
    due_date: resolvedAt,
    status: yes ? 'resolved_yes' : 'resolved_no',
    resolved_at: resolvedAt,
    reflection: null,
    integrity_bonus: confidence >= 35 && confidence <= 65,
  };
}

/** 20 well-covered resolutions across two months, enough to be non-provisional. */
function history(): Prediction[] {
  const rows: Prediction[] = [];
  for (let i = 0; i < 10; i++) rows.push(p(90, i < 9, `2026-08-1${i}T12:00:00.000Z`));
  for (let i = 0; i < 10; i++) rows.push(p(50, i < 5, `2026-09-1${i}T12:00:00.000Z`));
  return rows;
}

function seed({
  isPlus = true,
  resolved = history(),
}: { isPlus?: boolean; resolved?: Prediction[] } = {}) {
  useEntitlementStore.setState({
    entitlement: isPlus
      ? { is_plus: true, source: 'annual', expires_at: null }
      : FREE_ENTITLEMENT,
    isPlus,
    hydrated: true,
  });
  usePredictionStore.setState({ pending: [], resolved });
  useStatsStore.setState({ trends: buildTrendSummary(resolved) });
}

function fileDeps(overrides: Partial<FileExportDeps> = {}): FileExportDeps {
  return {
    writeCacheFile: jest.fn(async () => 'file:///cache/calibrate.csv'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => {}),
    ...overrides,
  };
}

afterEach(() => {
  __setFileExportDepsForTests(null);
  jest.restoreAllMocks();
});

describe('TrendsPanel — free', () => {
  it('shows the locked section rather than hiding the feature', () => {
    seed({ isPlus: false });
    render(<TrendsPanel />);

    expect(screen.getByTestId('trends-upsell')).toBeTruthy();
    expect(screen.queryByTestId('trends-panel')).toBeNull();
  });

  it('routes to the paywall', () => {
    seed({ isPlus: false });
    const onUpgrade = jest.fn();
    render(<TrendsPanel onUpgrade={onUpgrade} />);

    fireEvent.press(screen.getByTestId('trends-upsell-cta'));
    expect(onUpgrade).toHaveBeenCalled();
  });

  // The teaser may say how much history is waiting, but not what it says.
  it('gives away no scores in the teaser', () => {
    seed({ isPlus: false });
    render(<TrendsPanel />);

    expect(screen.queryByTestId('trends-delta')).toBeNull();
    expect(screen.queryByTestId('trend-period-2026-09')).toBeNull();
    expect(screen.queryByTestId('trends-export')).toBeNull();
    expect(screen.queryByTestId('trend-correction-work-80')).toBeNull();
  });
});

describe('TrendsPanel — Plus', () => {
  it('renders the month-by-month record', () => {
    seed();
    render(<TrendsPanel />);

    expect(screen.getByTestId('trend-period-2026-08')).toBeTruthy();
    expect(screen.getByTestId('trend-period-2026-09')).toBeTruthy();
  });

  it('renders the per-category drill-down and the range coverage', () => {
    seed();
    render(<TrendsPanel />);

    expect(screen.getByTestId('trend-category-work')).toBeTruthy();
    expect(screen.getByTestId('trends-coverage')).toBeTruthy();
  });

  // The same rule the headline rating follows: no number built on noise.
  it('shows a count, not a score, for a provisional month', () => {
    const thin = [p(90, true, '2026-07-01T12:00:00.000Z')];
    seed({ resolved: thin });
    render(<TrendsPanel />);

    const row = screen.getByTestId('trend-period-2026-07');
    expect(row).toHaveTextContent(/1 resolved$/);
    expect(row).not.toHaveTextContent('·');
  });

  // Roadmap step 20: the personal correction table.
  it('translates each well-used band into how often it came true', () => {
    const finance = Array.from({ length: 17 }, (_, i) =>
      p(90, i < 8, '2026-09-20T12:00:00.000Z', 'finance'),
    );
    seed({ resolved: [...history(), ...finance] });
    render(<TrendsPanel />);

    expect(screen.getByTestId('trend-correction-finance-80')).toHaveTextContent(
      'Finance at 80–100%47% · 8 of 17',
    );
    // The worst band leads, as a sentence.
    expect(screen.getByTestId('trends-corrections-lead')).toHaveTextContent(
      'In finance, your 80–100% has come true 47% of the time.',
    );
    // Calibrated bands get rows too, but never the lead.
    expect(screen.getByTestId('trend-correction-work-80')).toBeTruthy();
  });

  it('names the closest band while none has enough for a row', () => {
    const thin = Array.from({ length: 4 }, (_, i) => p(90, i < 2, '2026-07-01T12:00:00.000Z'));
    seed({ resolved: thin });
    render(<TrendsPanel />);

    expect(screen.getByTestId('trends-corrections-progress')).toHaveTextContent(
      /Closest: work at 80–100%, with 4\./,
    );
    expect(screen.queryByTestId('trend-correction-work-80')).toBeNull();
  });

  it('says so when there is nothing to chart yet', () => {
    seed({ resolved: [] });
    render(<TrendsPanel />);

    expect(screen.getByTestId('trends-empty')).toBeTruthy();
  });

  it('exports the full history, pending predictions included', async () => {
    const deps = fileDeps();
    __setFileExportDepsForTests(deps);
    seed();
    usePredictionStore.setState({
      pending: [
        {
          ...p(60, false, '2026-09-20T12:00:00.000Z'),
          status: 'pending',
          resolved_at: null,
        },
      ],
      resolved: history(),
    });
    render(<TrendsPanel />);

    fireEvent.press(screen.getByTestId('trends-export'));

    await waitFor(() => expect(deps.share).toHaveBeenCalled());
    const [, content] = (deps.writeCacheFile as jest.Mock).mock.calls[0];
    expect(String(content).trim().split('\r\n')).toHaveLength(22); // header + 21
  });

  it('reports an export failure instead of throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setFileExportDepsForTests(
      fileDeps({
        share: jest.fn(async () => {
          throw new Error('no sheet');
        }),
      }),
    );
    seed();
    render(<TrendsPanel />);

    fireEvent.press(screen.getByTestId('trends-export'));

    await waitFor(() =>
      expect(screen.getByTestId('trends-export-message')).toBeTruthy(),
    );
  });
});

import { fireEvent, render } from '@testing-library/react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import type { BucketStat } from '@/types';

function bucket(partial: Partial<BucketStat> & Pick<BucketStat, 'low'>): BucketStat {
  return {
    high: partial.low + 20,
    total_resolved: 10,
    resolved_yes: 5,
    stated_confidence_mean: partial.low + 10,
    actual_rate: 0.5,
    bucket_error: 0,
    ...partial,
  };
}

// onLayout never fires under RNTL (there's no layout engine), so the SVG body
// is gated behind width > 0. Drive it manually to exercise the drawing path.
function layout(node: ReturnType<typeof render>) {
  fireEvent(node.getByTestId('calibration-chart'), 'layout', {
    nativeEvent: { layout: { width: 300, height: 300, x: 0, y: 0 } },
  });
}

describe('CalibrationChart', () => {
  it('renders one point per bucket after layout', () => {
    const view = render(
      <CalibrationChart
        buckets={[
          bucket({ low: 0 }),
          bucket({ low: 40 }),
          bucket({ low: 80, high: 100 }),
        ]}
      />,
    );
    layout(view);

    expect(view.getByTestId('point-0')).toBeTruthy();
    expect(view.getByTestId('point-40')).toBeTruthy();
    expect(view.getByTestId('point-80')).toBeTruthy();
  });

  it('renders the container even before layout (width 0, no SVG body)', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 0 })]} />);
    expect(view.getByTestId('calibration-chart')).toBeTruthy();
    expect(view.queryByTestId('point-0')).toBeNull();
  });
});

// Geometry. At a faked 300×300 layout the plot math is fully determined, so we
// can pin actual pixel positions rather than just "a circle exists". Padding
// (from the component): left 34, right 12, top 12, bottom 28 →
//   innerW = 300 - 34 - 12 = 254, innerH = 300 - 12 - 28 = 260
//   xOf(conf) = 34 + (conf/100) * 254      (confidence → px, left→right)
//   yOf(rate) = 12 + (1 - rate) * 260      (rate → px, flipped: 1 is at top)
describe('CalibrationChart geometry', () => {
  const PAD_LEFT = 34;
  const PAD_TOP = 12;
  const INNER_W = 254;
  const INNER_H = 260;
  const xOf = (conf: number) => PAD_LEFT + (conf / 100) * INNER_W;
  const yOf = (rate: number) => PAD_TOP + (1 - rate) * INNER_H;

  it('flips the y-axis: rate 1 sits at the top, rate 0 at the bottom', () => {
    const view = render(
      <CalibrationChart
        buckets={[
          bucket({ low: 0, stated_confidence_mean: 0, actual_rate: 1 }),
          bucket({ low: 80, high: 100, stated_confidence_mean: 100, actual_rate: 0 }),
        ]}
      />,
    );
    layout(view);

    const topLeft = view.getByTestId('point-0').props;
    expect(topLeft.cx).toBeCloseTo(xOf(0), 1); // 34 — far left
    expect(topLeft.cy).toBeCloseTo(yOf(1), 1); // 12 — top edge

    const bottomRight = view.getByTestId('point-80').props;
    expect(bottomRight.cx).toBeCloseTo(xOf(100), 1); // 288 — far right
    expect(bottomRight.cy).toBeCloseTo(yOf(0), 1); // 272 — bottom edge
  });

  it('keeps boundary points inside the plot (no clipping at rate 0/1)', () => {
    const view = render(
      <CalibrationChart
        buckets={[bucket({ low: 80, high: 100, stated_confidence_mean: 90, actual_rate: 1 })]}
      />,
    );
    layout(view);
    const { cy } = view.getByTestId('point-80').props;
    expect(cy).toBeGreaterThanOrEqual(PAD_TOP);
    expect(cy).toBeLessThanOrEqual(PAD_TOP + INNER_H);
  });

  it('places an overconfident bucket below the perfect-calibration diagonal', () => {
    // Stated 90% but only 30% came true → overconfident → should plot below
    // the diagonal, i.e. at a larger y than the diagonal at that x.
    const view = render(
      <CalibrationChart
        buckets={[bucket({ low: 80, high: 100, stated_confidence_mean: 90, actual_rate: 0.3 })]}
      />,
    );
    layout(view);
    const { cy } = view.getByTestId('point-80').props;
    const diagonalYAtStated = yOf(0.9); // where a perfectly-calibrated point would be
    expect(cy).toBeGreaterThan(diagonalYAtStated);
  });

  it('scales marker radius with bucket sample size', () => {
    const view = render(
      <CalibrationChart
        buckets={[
          bucket({ low: 0, total_resolved: 10 }), // max n → largest radius
          bucket({ low: 80, high: 100, total_resolved: 2 }), // smaller n
        ]}
      />,
    );
    layout(view);
    const big = view.getByTestId('point-0').props.r;
    const small = view.getByTestId('point-80').props.r;
    expect(big).toBeGreaterThan(small);
    expect(big).toBeCloseTo(10, 1); // 4 + (10/10)*6
    expect(small).toBeCloseTo(5.2, 1); // 4 + (2/10)*6
  });

  it('draws a connecting line only when there is more than one bucket', () => {
    const single = render(<CalibrationChart buckets={[bucket({ low: 0 })]} />);
    layout(single);
    expect(single.queryByTestId('calibration-curve-line')).toBeNull();

    const multi = render(
      <CalibrationChart buckets={[bucket({ low: 0 }), bucket({ low: 80, high: 100 })]} />,
    );
    layout(multi);
    expect(multi.queryByTestId('calibration-curve-line')).toBeTruthy();
  });
});

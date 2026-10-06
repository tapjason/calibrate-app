import { fireEvent, render } from '@testing-library/react-native';

import { CalibrationChart, placeDotLabels } from '@/components/stats/CalibrationChart';
import { haptics } from '@/components/ui/haptics';
import type { BucketStat } from '@/types';

function bucket(partial: Partial<BucketStat> & Pick<BucketStat, 'low'>): BucketStat {
  return {
    high: partial.low + 20,
    total_resolved: 10,
    resolved_yes: 5,
    stated_confidence_mean: partial.low + 10,
    actual_rate: 0.5,
    bucket_error: 0,
    direction: 'calibrated',
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
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

// DESIGN_SYSTEM §7.2: position + tint + words, never colour alone.
describe('CalibrationChart honesty', () => {
  it('draws the labelled regions and diagonal even with no data (ghost chart)', () => {
    const view = render(<CalibrationChart buckets={[]} />);
    layout(view);
    expect(view.getByTestId('region-over')).toBeTruthy();
    expect(view.getByTestId('region-under')).toBeTruthy();
    expect(view.queryByTestId('calibration-curve-line')).toBeNull();
  });

  it('colours each dot by the side the engine put it on', () => {
    const view = render(
      <CalibrationChart
        buckets={[
          bucket({ low: 80, high: 100, direction: 'overconfident' }),
          bucket({ low: 20, direction: 'underconfident' }),
          bucket({ low: 40, direction: 'calibrated' }),
        ]}
      />,
    );
    layout(view);
    const fills = ['point-80', 'point-20', 'point-40'].map(
      (id) => view.getByTestId(id).props.fill,
    );
    expect(new Set(fills).size).toBe(3);
  });

  it('labels every dot with its sample size', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 60, total_resolved: 7 })]} />);
    layout(view);
    expect(view.getByTestId('point-60-n')).toBeTruthy();
  });

  // The line used to run through the demo's "n=8" (roadmap step 16).
  it('draws a halo under each label, at the same spot', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 60, total_resolved: 7 })]} />);
    layout(view);
    const halo = view.getByTestId('point-60-n-halo').props;
    const label = view.getByTestId('point-60-n').props;
    // Colours arrive processed by react-native-svg, so compare them to each
    // other: the halo is one flat colour, and not the label's ink.
    expect(halo.stroke).toEqual(halo.fill);
    expect(halo.fill).not.toEqual(label.fill);
    expect(halo.strokeWidth).toBeGreaterThan(0);
    expect([halo.x, halo.y]).toEqual([label.x, label.y]);
  });
});

describe('CalibrationChart reveal', () => {
  it('still renders every dot and the line when animating in', () => {
    const view = render(
      <CalibrationChart
        animateIn
        buckets={[bucket({ low: 20 }), bucket({ low: 80, high: 100 })]}
      />,
    );
    layout(view);
    expect(view.getByTestId('calibration-curve-line')).toBeTruthy();
    expect(view.getByTestId('point-20')).toBeTruthy();
    expect(view.getByTestId('point-80')).toBeTruthy();
  });
});

describe('CalibrationChart reveal haptic', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const buckets = [bucket({ low: 20 }), bucket({ low: 60 }), bucket({ low: 80, high: 100 })];

  it('taps once as the last dot lands, not before', () => {
    const reveal = jest.spyOn(haptics, 'reveal').mockImplementation(() => {});
    const view = render(<CalibrationChart buckets={buckets} animateIn />);
    layout(view);

    // Line 400 ms, then dots 60 ms apart, each fading for 200 ms: 720 ms.
    jest.advanceTimersByTime(719);
    expect(reveal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('stays silent on an ordinary visit to Stats', () => {
    const reveal = jest.spyOn(haptics, 'reveal').mockImplementation(() => {});
    const view = render(<CalibrationChart buckets={buckets} />);
    layout(view);
    jest.advanceTimersByTime(2000);
    expect(reveal).not.toHaveBeenCalled();
  });
});

describe('placeDotLabels', () => {
  const TOP = 12;
  const BOTTOM = 300;

  it('puts labels above their dots when there is room', () => {
    const ys = placeDotLabels(
      [
        { cx: 50, cy: 200, r: 6, text: 'n=5' },
        { cx: 200, cy: 100, r: 6, text: 'n=3' },
      ],
      TOP,
      BOTTOM,
    );
    expect(ys).toEqual([190, 90]);
  });

  // The Warmup verdict on the web build, 2026-10-04: dots at 75% and 80% at
  // the same height printed "n=5n=5".
  it('moves a label below its dot rather than overprint a neighbour', () => {
    const [first, second] = placeDotLabels(
      [
        { cx: 300, cy: 150, r: 8, text: 'n=5' },
        { cx: 318, cy: 150, r: 8, text: 'n=5' },
      ],
      TOP,
      BOTTOM,
    );
    expect(first).toBeLessThan(150);
    expect(second).toBeGreaterThan(150);
  });

  it('keeps a label inside the plot at the top edge', () => {
    const [y] = placeDotLabels([{ cx: 100, cy: 14, r: 6, text: 'n=2' }], TOP, BOTTOM);
    expect(y).toBeGreaterThan(14);
  });
});

// Roadmap D4: the grey capsule behind each dot, from the engine's range.
describe('CalibrationChart chance capsules', () => {
  it('draws one per bucket, spanning the chance range, centred on the stated mean', () => {
    const b = bucket({ low: 60, stated_confidence_mean: 70, chance_low: 0.6, chance_high: 0.8 });
    const view = render(<CalibrationChart buckets={[b]} />);
    fireEvent(view.getByTestId('calibration-chart'), 'layout', {
      nativeEvent: { layout: { width: 346, height: 346 } },
    });
    const capsule = view.getByTestId('chance-60', { includeHiddenElements: true });
    const dot = view.getByTestId('point-60', { includeHiddenElements: true });
    const { x, y, width, height } = capsule.props;
    // Centred on the dot's x.
    expect(Number(x) + Number(width) / 2).toBeCloseTo(Number(dot.props.cx));
    // 20 points of rate on a 306px-tall plot (346 − 12 − 28).
    expect(Number(height)).toBeCloseTo(0.2 * 306);
    expect(Number(y)).toBeLessThan(Number(dot.props.cy));
  });
});

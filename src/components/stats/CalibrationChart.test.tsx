import { fireEvent, render } from '@testing-library/react-native';

import {
  CalibrationChart,
  labelAt,
  placeDotLabels,
  xTickLabel,
} from '@/components/stats/CalibrationChart';
import { haptics } from '@/components/ui/haptics';
import { palettes, type Palette } from '@/constants/theme';
import type { BucketStat } from '@/types';

/**
 * A colour as react-native-svg hands it to the host: a brush holding the
 * DynamicColorIOS pair as ARGB numbers. Read back as the light and dark hex.
 */
function brushHex(brush: { payload: { dynamic: { light: number; dark: number } } }) {
  const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
  return { light: hex(brush.payload.dynamic.light), dark: hex(brush.payload.dynamic.dark) };
}
const token = (key: keyof Palette) => ({ light: palettes.light[key], dark: palettes.dark[key] });

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

  // Roadmap D58: no lean mark under 10 answers, as no lean word.
  it('greys a dot under 10 answers, whichever side the engine put it on', () => {
    const view = render(
      <CalibrationChart
        buckets={[
          bucket({ low: 80, high: 100, direction: 'overconfident', total_resolved: 9 }),
          bucket({ low: 20, direction: 'underconfident', total_resolved: 4 }),
          bucket({ low: 40, direction: 'calibrated', total_resolved: 3 }),
          bucket({ low: 60, direction: 'overconfident', total_resolved: 10 }),
          bucket({ low: 0, direction: 'calibrated', total_resolved: 12 }),
        ]}
      />,
    );
    layout(view);
    const fill = (id: string) => view.getByTestId(id).props.fill;
    expect(fill('point-20')).toEqual(fill('point-80'));
    expect(fill('point-40')).toEqual(fill('point-80'));
    // Not a lean colour: exactly 10 keeps its own, and a thin "calibrated"
    // range isn't green ("on the line") either.
    expect(fill('point-60')).not.toEqual(fill('point-80'));
    expect(fill('point-0')).not.toEqual(fill('point-40'));
  });

  // Roadmap D58 (owner, 2026-11-10): said only when a grey dot is drawn.
  it('says what a grey dot is, only when one is drawn', () => {
    const thin = render(<CalibrationChart buckets={[bucket({ low: 60, total_resolved: 9 })]} />);
    fireEvent.press(thin.getByTestId('chart-key-toggle'));
    expect(thin.getByTestId('chart-caption')).toHaveTextContent(
      /A grey dot has fewer than 10 answers, too few to read yet\./,
    );
    thin.unmount();
    const solid = render(<CalibrationChart buckets={[bucket({ low: 60, total_resolved: 10 })]} />);
    fireEvent.press(solid.getByTestId('chart-key-toggle'));
    expect(solid.getByTestId('chart-caption')).not.toHaveTextContent(/grey dot/);
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
    ).map((s) => s.y);
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
    ).map((s) => s.y);
    expect(first).toBeLessThan(150);
    expect(second).toBeGreaterThan(150);
  });

  // Playtest 2026-11-08b, finding 16: the right-most label ends at the
  // chart's edge, so it sits further left than its dot; measured as centred,
  // "n=300" was never checked against "n=277" beside it.
  it('checks a label where it is drawn, ended at the edge', () => {
    const dots = [
      { cx: 230, cy: 150, r: 8, text: 'n=277' },
      { cx: 275, cy: 150, r: 8, text: 'n=300' },
    ];
    const [, centred] = placeDotLabels(dots, TOP, BOTTOM).map((s) => s.y);
    expect(centred).toBeLessThan(150);
    const [first, second] = placeDotLabels(dots, TOP, BOTTOM, [], 290).map((s) => s.y);
    expect(first).toBeLessThan(150);
    expect(second).toBeGreaterThan(150);
  });

  it('keeps a label inside the plot at the top edge', () => {
    const [{ y }] = placeDotLabels([{ cx: 100, cy: 14, r: 6, text: 'n=2' }], TOP, BOTTOM);
    // Below the dot with a gap, so its halo doesn't cover half of it (blind
    // playtest 2026-11-12d, run 3).
    expect(y - 12).toBeGreaterThanOrEqual(14 + 6 + 4);
  });

  // Blind playtest 2026-11-12d, run 5: a dot at 0% by "Overconfident" printed
  // "Ove n=2 confident".
  it('goes beside the dot when above and below are both taken', () => {
    // "Overconfident" ends 8 px in from the right and 10 px up from the axis.
    const region = { x0: 200, x1: 300, y0: 266, y1: 278 };
    const [spot] = placeDotLabels(
      [{ cx: 304, cy: BOTTOM, r: 8, text: 'n=2' }],
      TOP,
      BOTTOM,
      [region],
      320,
    );
    // Left of the dot: above is the region label, below and right are off the chart.
    expect(spot).toEqual({ x: 292, y: BOTTOM, anchor: 'end' });
  });

  // The same, as the chart draws it: "Overconfident" sits 10 px above the
  // axis, so beside the dot is taken too, and the label goes above the word.
  it('goes above the region label when everything near the dot is taken', () => {
    const right = 331;
    const over = 'Overconfident'.length * 12 * 0.65;
    const region = { x0: right - 8 - over, x1: right - 8, y0: BOTTOM - 22, y1: BOTTOM - 10 };
    const [spot] = placeDotLabels(
      [{ cx: 275, cy: BOTTOM, r: 10, text: 'n=1' }],
      TOP,
      BOTTOM,
      [region],
      343,
    );
    expect(spot.y).toBeLessThanOrEqual(region.y0);
    expect(spot.anchor).toBe('middle');
  });

  it('keeps off other dots', () => {
    const [, second] = placeDotLabels(
      [
        { cx: 100, cy: 100, r: 8, text: 'n=4' },
        { cx: 100, cy: 130, r: 8, text: 'n=3' },
      ],
      TOP,
      BOTTOM,
      [],
      320,
    );
    // Above the second dot is the first dot; below is free.
    expect(second.y).toBeGreaterThan(130);
  });

  // Blind playtest 2026-11-12d, run 3: "n=1" sat on its own long bar.
  it("keeps off a thin range's bar where it can", () => {
    const bar = { x0: 95, x1: 105, y0: TOP, y1: BOTTOM };
    const [spot] = placeDotLabels([{ cx: 100, cy: 14, r: 5, text: 'n=1' }], TOP, BOTTOM, [], 320, [bar]);
    expect(spot.anchor).toBe('start');
    expect(spot.x).toBeGreaterThan(105);
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
    // Roadmap D47: an outline at 3:1 or better, the faint fill alone was ~1.2:1.
    // (Its colour is textTertiary; its contrast is checked in theme.test.)
    expect(capsule.props.stroke).toBeTruthy();
    expect(Number(capsule.props.strokeWidth)).toBeGreaterThanOrEqual(1);
  });

  // Blind playtest 2026-11-13c, finding 23: a bar at 60–80% ran through
  // "Overconfident". The labels paint after the bars, the dots after both.
  it('paint under the region labels, and the dots over everything', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 60 })]} />);
    fireEvent(view.getByTestId('calibration-chart'), 'layout', {
      nativeEvent: { layout: { width: 346, height: 346 } },
    });
    const tree = JSON.stringify(view.toJSON());
    const at = (id: string) => tree.indexOf(`"testID":"${id}"`);
    expect(at('chance-60')).toBeGreaterThan(-1);
    expect(at('region-label-over')).toBeGreaterThan(at('chance-60'));
    expect(at('region-label-under')).toBeGreaterThan(at('chance-60'));
    expect(at('point-60')).toBeGreaterThan(at('region-label-over'));
  });

  // Step 195: over the over tint, a grid line or a luck bar, overText read
  // 4.27:1 in light, under the 4.5:1 text needs. Each word sits on a canvas
  // halo, as the n labels do, where overText is 4.62:1 (theme.test.ts).
  it('sets each zone word on a canvas halo, drawn just before it', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 60 })]} />);
    layout(view);
    const opts = { includeHiddenElements: true };
    for (const [side, ink] of [
      ['over', 'overText'],
      ['under', 'underText'],
    ] as const) {
      const halo = view.getByTestId(`region-label-${side}-halo`, opts);
      const word = view.getByTestId(`region-label-${side}`, opts);
      expect(brushHex(halo.props.fill)).toEqual(token('canvas'));
      expect(brushHex(halo.props.stroke)).toEqual(token('canvas'));
      expect(Number(halo.props.strokeWidth)).toBeGreaterThanOrEqual(3);
      expect(brushHex(word.props.fill)).toEqual(token(ink));
      expect([halo.props.x, halo.props.y]).toEqual([word.props.x, word.props.y]);
    }
    const tree = JSON.stringify(view.toJSON());
    const at = (id: string) => tree.indexOf(`"testID":"${id}"`);
    expect(at('region-label-over-halo')).toBeGreaterThan(at('chance-60'));
    expect(at('region-label-over')).toBeGreaterThan(at('region-label-over-halo'));
    expect(at('region-label-under')).toBeGreaterThan(at('region-label-under-halo'));
  });

  // Step 181 (blind playtest 2026-11-14, finding 11): "Overconfident" over
  // one late bus read as a verdict. The words wait for a range with 10, as
  // the dots' colours do (D58); the empty chart keeps them, as its frame.
  it('names the zones only once a range has 10 answers, or on the empty chart', () => {
    const thin = render(
      <CalibrationChart buckets={[bucket({ low: 80, high: 100, total_resolved: 2 })]} />,
    );
    layout(thin);
    expect(thin.queryByTestId('region-label-over')).toBeNull();
    expect(thin.queryByTestId('region-label-under')).toBeNull();
    thin.unmount();

    const solid = render(
      <CalibrationChart
        buckets={[bucket({ low: 60, total_resolved: 3 }), bucket({ low: 80, high: 100 })]}
      />,
    );
    layout(solid);
    expect(solid.getByTestId('region-label-over')).toBeTruthy();
    expect(solid.getByTestId('region-label-under')).toBeTruthy();
    solid.unmount();

    const empty = render(<CalibrationChart buckets={[]} />);
    layout(empty);
    expect(empty.getByTestId('region-label-over')).toBeTruthy();
  });

  // Roadmap step 68: the key names only what's drawn.
  it('are explained in the key only when there are some', () => {
    const empty = render(<CalibrationChart buckets={[]} />);
    fireEvent.press(empty.getByTestId('chart-key-toggle'));
    expect(empty.getByTestId('chart-caption')).not.toHaveTextContent(/Grey bars/);
    empty.unmount();
    const drawn = render(<CalibrationChart buckets={[bucket({ low: 60 })]} />);
    fireEvent.press(drawn.getByTestId('chart-key-toggle'));
    expect(drawn.getByTestId('chart-caption')).toHaveTextContent(/Grey bars: where a perfectly calibrated dot lands/);
    // Inside the bar is "can’t be told apart", not "as close as luck allows"
    // (blind playtest 2026-11-05, run 3). The curly apostrophe, as the rest of
    // the page (code review 2026-11-23, round 2).
    expect(drawn.getByTestId('chart-caption')).toHaveTextContent(/can’t be told apart from perfect calibration\. /);
    expect(drawn.getByTestId('chart-caption')).not.toHaveTextContent(/'/);
    // What the colours mean, once a dot has 10 (D62).
    expect(drawn.getByTestId('chart-caption')).toHaveTextContent(
      /Orange, below the line: too sure\. Blue, above it: too cautious\. Green: no clear lean, within luck or under 5 points off\./,
    );
  });
});

describe('labelAt', () => {
  it('centres a label on its dot', () => {
    expect(labelAt(150, 'n=10', 320)).toEqual({ x: 150, anchor: 'middle' });
  });

  // A 100%-stated dot sits at the right padding; a centred "n=10" ran off the
  // chart ("n=1C" at 320pt).
  it('ends a label at the edge when centring would clip it', () => {
    expect(labelAt(308, 'n=10', 320)).toEqual({ x: 318, anchor: 'end' });
  });
});

// 2026-10-09 dry run: "80%100%" ran together at 320pt.
describe('xTickLabel', () => {
  it('keeps the percent sign where the ticks have room, and drops it where they do not', () => {
    expect(xTickLabel(80, 58)).toBe('80%');
    expect(xTickLabel(80, 47)).toBe('80');
  });

  // Owner, 2026-11-23: the 85-word key is folded behind a toggle.
  it('folds the key behind "How to read this chart"', () => {
    const view = render(<CalibrationChart buckets={[bucket({ low: 60 })]} />);
    const toggle = view.getByTestId('chart-key-toggle');
    expect(view.queryByTestId('chart-caption')).toBeNull();
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(view.getByText('How to read this chart')).toBeTruthy();
    fireEvent.press(toggle);
    expect(view.getByTestId('chart-caption')).toHaveTextContent(/Dashed line: perfectly calibrated/);
    expect(view.getByTestId('chart-key-toggle').props.accessibilityState).toEqual({ expanded: true });
    // Named for what it hides (code review 2026-11-23: "Hide" alone).
    expect(view.getByText('Hide the key')).toBeTruthy();
    expect(view.queryByText('Hide')).toBeNull();
    fireEvent.press(view.getByTestId('chart-key-toggle'));
    expect(view.queryByTestId('chart-caption')).toBeNull();
  });
});

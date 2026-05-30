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

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';
import type { BucketStat } from '@/types';

import { CoverageRow, coverageCellFloor } from './CoverageRow';

function bucket(low: number, n: number): BucketStat {
  return { low, high: low + 20, total_resolved: n } as BucketStat;
}

// Playtest 2026-11-08b, finding 16: at large text two counts ran together,
// "277300", in cells too narrow for them.
describe('CoverageRow', () => {
  it('sizes a cell for its widest count, growing with the text', () => {
    expect(coverageCellFloor(3, 1)).toBeLessThan(52); // five fit at 320 wide
    expect(coverageCellFloor(3, 2)).toBeGreaterThan(coverageCellFloor(3, 1) * 1.6);
    expect(coverageCellFloor(1, 1)).toBe(coverageCellFloor(2, 1)); // "none" is the floor
  });

  it('groups a four-digit count', () => {
    render(<CoverageRow buckets={[bucket(80, 1234)]} />);
    expect(screen.getByText(/^1\D234$/)).toBeTruthy();
  });

  // Step 195: an empty range's dashes alternate with its sunken fill, where
  // controlBorder is 2.93:1 in light; textTertiary is 4.66:1.
  it('dashes an empty range in textTertiary, on Insights and the Warmup alike', () => {
    const border = () => StyleSheet.flatten(screen.getByTestId('coverage-0').props.style);
    const { rerender } = render(<CoverageRow buckets={[bucket(80, 12)]} />);
    expect(border()).toMatchObject({
      backgroundColor: colors.surfaceSunken,
      borderColor: colors.textTertiary,
      borderStyle: 'dashed',
    });
    rerender(<CoverageRow buckets={[bucket(80, 12)]} onSelectRange={jest.fn()} />);
    expect(border().borderColor).toBe(colors.textTertiary);
    // A range that opens its predictions keeps the control outline on the canvas.
    expect(StyleSheet.flatten(screen.getByTestId('coverage-80').props.style).borderColor).toBe(
      colors.controlBorder,
    );
  });
});

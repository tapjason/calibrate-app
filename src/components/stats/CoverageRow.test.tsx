import { render, screen } from '@testing-library/react-native';

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
});

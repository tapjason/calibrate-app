import { fireEvent, render, screen } from '@testing-library/react-native';

import { dayChipWidth, DayChips } from './DayChips';

describe('dayChipWidth', () => {
  it('lets seven share one row when they fit with 8pt between', () => {
    // 7 × 31 + 6 × 8 = 265.
    expect(dayChipWidth(309, 31)).toBeUndefined();
    expect(dayChipWidth(265, 31)).toBeUndefined();
  });

  it('waits for a measured row', () => {
    expect(dayChipWidth(0, 31)).toBeUndefined();
  });

  // Blind playtest 2026-11-12, finding 10: at 320 wide the 8pt gap left
  // Saturday alone on a second row, stretched across it.
  it('balances the rows, four and three, when seven do not fit', () => {
    const width = dayChipWidth(254, 31);
    expect(width).toBe(Math.floor((254 - 3 * 8) / 4));
    expect(width! * 4 + 3 * 8).toBeLessThanOrEqual(254);
    expect(width!).toBeGreaterThanOrEqual(31);
  });

  it('never makes a chip narrower than its three letters', () => {
    for (const row of [120, 180, 254, 300]) {
      for (const min of [31, 40, 62]) {
        const width = dayChipWidth(row, min);
        if (width !== undefined) expect(width).toBeGreaterThanOrEqual(Math.min(min, row));
      }
    }
  });
});

// Blind playtest 2026-11-12, finding 2: Voice Control users say what they see.
describe('DayChips', () => {
  it('names each chip as shown, with the full day as the hint', () => {
    const onChange = jest.fn();
    render(<DayChips value={0} onChange={onChange} testID="d" />);
    const tue = screen.getByTestId('d-2');
    expect(tue.props.accessibilityLabel).toBe('Tue');
    expect(tue.props.accessibilityHint).toBe('Weekly digest on Tuesday');
    fireEvent.press(screen.getByRole('radio', { name: 'Tue' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

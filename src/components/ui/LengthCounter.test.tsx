import { render, screen } from '@testing-library/react-native';

import { LengthCounter, lengthText, showLength } from './LengthCounter';

// Playtest 2026-11-08, finding 20: limits were reached in silence.
describe('LengthCounter', () => {
  it('shows only in the last fifth, and at least the last ten', () => {
    expect(showLength(159, 200)).toBe(false);
    expect(showLength(160, 200)).toBe(true);
    expect(showLength(13, 24)).toBe(false);
    expect(showLength(14, 24)).toBe(true);
  });

  it('counts toward the limit and names it once reached', () => {
    expect(lengthText(180, 200)).toBe('180 of 200');
    expect(lengthText(200, 200)).toBe('200 of 200, the most it takes');
  });

  it('renders nothing far from the limit', () => {
    render(<LengthCounter length={10} max={200} testID="c" />);
    expect(screen.queryByTestId('c')).toBeNull();
  });

  it('renders the count near it', () => {
    render(<LengthCounter length={190} max={200} testID="c" />);
    expect(screen.getByTestId('c')).toHaveTextContent('190 of 200');
  });
});

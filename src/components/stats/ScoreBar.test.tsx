import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ScoreBar } from './ScoreBar';

const hidden = { includeHiddenElements: true } as const;

describe('ScoreBar', () => {
  it('marks the badge thresholds', () => {
    render(<ScoreBar score={78} testID="bar" />);
    for (const t of ['70', '85', '90']) {
      expect(screen.getByText(t, hidden)).toBeTruthy();
    }
  });

  // The number beside it is what screen readers get; the bar is decoration.
  it('is hidden from screen readers', () => {
    render(<ScoreBar score={78} testID="bar" />);
    expect(screen.queryByTestId('bar')).toBeNull();
    expect(screen.getByTestId('bar', hidden)).toBeTruthy();
  });

  it('clamps the fill to the track', () => {
    render(<ScoreBar score={140} testID="bar" />);
    const track = screen.getByTestId('bar', hidden).props.children[0];
    const fill = track.props.children[0];
    expect(StyleSheet.flatten(fill.props.style).width).toBe('100%');
  });
});

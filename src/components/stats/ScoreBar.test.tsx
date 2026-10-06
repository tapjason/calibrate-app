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

  // Roadmap step 52: 85 and 90 are 5% apart and ran together as "8590" at
  // 320pt. They now sit on the outer side of their ticks.
  it('sets 85 left of its tick and 90 right of its own', () => {
    render(<ScoreBar score={78} testID="bar" />);
    const style = (t: number) =>
      StyleSheet.flatten(screen.getByTestId(`score-bar-label-${t}`, hidden).props.style);
    expect(style(70).textAlign).toBe('center');
    expect(style(85).textAlign).toBe('right');
    expect(style(85).marginLeft).toBeLessThan(-style(85).width);
    expect(style(90).textAlign).toBe('left');
    expect(style(90).marginLeft).toBeGreaterThan(0);
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

// Roadmap D4: the give-or-take as a soft band over the end of the fill.
describe('ScoreBar range', () => {
  it('draws the range as a band from low to high', () => {
    render(<ScoreBar score={92} range={{ low: 89, high: 95 }} testID="bar" />);
    const band = StyleSheet.flatten(
      screen.getByTestId('bar-range', { includeHiddenElements: true }).props.style,
    );
    expect(band.left).toBe('89%');
    expect(band.width).toBe('6%');
  });

  it('draws nothing for an empty or missing range', () => {
    render(<ScoreBar score={92} range={{ low: 92, high: 92 }} testID="bar" />);
    expect(screen.queryByTestId('bar-range', { includeHiddenElements: true })).toBeNull();
  });
});

import { render, screen } from '@testing-library/react-native';
import { Children, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ScoreBar } from './ScoreBar';

const hidden = { includeHiddenElements: true } as const;

describe('ScoreBar', () => {
  // The number beside it is what screen readers get; the bar is decoration.
  it('is hidden from screen readers', () => {
    render(<ScoreBar score={78} testID="bar" />);
    expect(screen.queryByTestId('bar')).toBeNull();
    expect(screen.getByTestId('bar', hidden)).toBeTruthy();
  });

  it('clamps the fill to the track', () => {
    render(<ScoreBar score={140} testID="bar" />);
    const track = screen.getByTestId('bar', hidden).props.children;
    const fill = track.props.children[0];
    expect(StyleSheet.flatten(fill.props.style).width).toBe('100%');
  });

  // Step 173 on Today, and Insights since the record audit of 2026-11-23:
  // the 70 / 85 / 90 marks are a category's badge bars, and under the overall
  // rating testers read them as its tiers. No marks, no numbers, nothing
  // spoken about them.
  it('draws no badge marks or their numbers, and says nothing of them', () => {
    render(<ScoreBar score={88} range={{ low: 85, high: 91 }} testID="bar" />);
    for (const t of ['70', '85', '90']) {
      expect(screen.queryByText(t, hidden)).toBeNull();
      expect(screen.queryByTestId(`score-bar-label-${t}`, hidden)).toBeNull();
    }
    expect(screen.queryByLabelText(/badge bars/)).toBeNull();
    expect(screen.getByTestId('bar-needle', hidden)).toBeTruthy();
  });

  // Code review 2026-11-23, round 2: the track holds exactly the fill, the
  // give-or-take band when there is one, and the needle, so a mark that comes
  // back (with or without a testID) fails here.
  it('holds only the fill, the optional band and the needle', () => {
    // The track's children as rendered: Children.toArray drops a null band.
    type Kid = ReactElement<{ testID?: string; style?: StyleProp<ViewStyle> }>;
    const trackChildren = () => {
      const track = screen.getByTestId('bar', hidden).props.children as ReactElement<{
        children?: ReactNode;
      }>;
      return Children.toArray(track.props.children) as Kid[];
    };

    const withBand = render(<ScoreBar score={88} range={{ low: 85, high: 91 }} testID="bar" />);
    let kids = trackChildren();
    expect(kids.map((k) => k.props.testID)).toEqual([undefined, 'bar-range', 'bar-needle']);
    expect(StyleSheet.flatten(kids[0]!.props.style).width).toBe('88%');
    withBand.unmount();

    render(<ScoreBar score={88} testID="bar" />);
    kids = trackChildren();
    expect(kids.map((k) => k.props.testID)).toEqual([undefined, 'bar-needle']);
    expect(StyleSheet.flatten(kids[0]!.props.style).width).toBe('88%');
  });
});

// Roadmap D4: the give-or-take as a soft band over the end of the fill.
describe('ScoreBar range', () => {
  it('draws the range as a band from low to high', () => {
    render(<ScoreBar score={92} range={{ low: 89, high: 95 }} testID="bar" />);
    const band = StyleSheet.flatten(screen.getByTestId('bar-range', hidden).props.style);
    expect(band.left).toBe('89%');
    expect(band.width).toBe('6%');
  });

  it('draws nothing for an empty or missing range', () => {
    render(<ScoreBar score={92} range={{ low: 92, high: 92 }} testID="bar" />);
    expect(screen.queryByTestId('bar-range', hidden)).toBeNull();
  });
});

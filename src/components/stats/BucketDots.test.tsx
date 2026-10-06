import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BucketDots } from './BucketDots';

const hidden = { includeHiddenElements: true } as const;

// Roadmap D4: a range as an icon array, with the expected count marked.
describe('BucketDots', () => {
  it('draws a dot per prediction, filled for each that happened', () => {
    render(<BucketDots total={5} happened={2} expected={3.5} testID="d" />);
    const fill = (i: number) =>
      StyleSheet.flatten(screen.getByTestId(`d-dot-${i}`, hidden).props.style).backgroundColor;
    expect(fill(0)).toBeDefined();
    expect(fill(1)).toBeDefined();
    expect(fill(2)).toBeUndefined();
    expect(screen.queryByTestId('d-dot-5', hidden)).toBeNull();
  });

  it('puts the marker after the expected count', () => {
    render(<BucketDots total={5} happened={2} expected={3.5} testID="d" />);
    const grid = screen.getByTestId('d', hidden);
    const ids = grid.props.children.map((c: { props: { testID?: string } }) => c.props.testID);
    // round(3.5) = 4: after the fourth dot.
    expect(ids.indexOf('d-marker')).toBe(4);
  });

  it('lets each dot stand for several when there are many', () => {
    render(<BucketDots total={120} happened={70} expected={80} testID="d" />);
    expect(screen.queryByTestId('d-dot-59', hidden)).toBeTruthy();
    expect(screen.queryByTestId('d-dot-60', hidden)).toBeNull();
    expect(screen.getByText('Each dot is 2 predictions.', hidden)).toBeTruthy();
  });

  it('is hidden from screen readers', () => {
    render(<BucketDots total={3} happened={1} expected={2} testID="d" />);
    expect(screen.queryByTestId('d')).toBeNull();
  });
});

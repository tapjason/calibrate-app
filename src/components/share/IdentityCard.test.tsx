import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { ShareCard } from '@/types';

import { fitScale, IdentityCard } from './IdentityCard';

const CARD: ShareCard = {
  rating: 92,
  total_resolved: 146,
  categories: [
    { category: 'health', badge_level: 'sharp' },
    { category: 'finance', badge_level: 'guesser' },
  ],
};

// Roadmap step 53: the card overflowed its 3:4 box on 375pt phones.
describe('fitScale', () => {
  it('leaves content that fits alone', () => {
    expect(fitScale(400, 380)).toBe(1);
    expect(fitScale(400, 400)).toBe(1);
  });

  it('shrinks taller content to the room it has', () => {
    expect(fitScale(400, 500)).toBeCloseTo(0.8);
  });

  it('waits for a measured room', () => {
    expect(fitScale(0, 500)).toBe(1);
  });
});

describe('IdentityCard on its canvas', () => {
  it('shrinks the content as one piece when it is taller than the room', () => {
    render(<IdentityCard card={CARD} format="post" />);
    fireEvent(screen.getByTestId('card-content'), 'layout', {
      nativeEvent: { layout: { height: 450 } },
    });
    // The room between the top and the footer, as the card lays it out.
    fireEvent(screen.getByTestId('card-body'), 'layout', {
      nativeEvent: { layout: { height: 360 } },
    });
    const style = StyleSheet.flatten(screen.getByTestId('card-content').props.style);
    expect(style.transform).toEqual([{ scale: 0.8 }]);
  });

  it('leaves content that fits unscaled', () => {
    render(<IdentityCard card={CARD} format="post" />);
    fireEvent(screen.getByTestId('card-content'), 'layout', {
      nativeEvent: { layout: { height: 300 } },
    });
    const style = StyleSheet.flatten(screen.getByTestId('card-content').props.style);
    expect(style.transform).toBeUndefined();
  });
});

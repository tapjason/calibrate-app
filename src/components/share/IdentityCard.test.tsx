import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { BucketStat, ShareCard } from '@/types';

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

// Roadmap D80 (the owner, 2026-11-25): the card's hook in his words, and the
// word "sharp" gone ("What are you sharp at?" until then).
describe('IdentityCard hook', () => {
  it('ends on "Learn when to trust your gut", with the medal named', () => {
    render(<IdentityCard card={CARD} />);
    expect(screen.getByText('Learn when to trust your gut')).toBeTruthy();
    expect(screen.getByText('Gold in health')).toBeTruthy();
    expect(screen.queryByText(/sharp/i)).toBeNull();
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

const strip = (low: number, direction: BucketStat['direction'], n = 12): BucketStat => ({
  low,
  high: low + 20,
  total_resolved: n,
  resolved_yes: Math.round(n / 2),
  stated_confidence_mean: low + 10,
  actual_rate: 0.5,
  bucket_error: 0,
  direction,
  chance_low: 0,
  chance_high: 1,
  expected_yes: 0,
});

// Roadmap D47 (playtest 2026-11-08 finding 16, 2026-11-10 finding 8): the
// five-dot row had no label, and under tritanopia "on the line" and "too
// cautious" were one colour. Now its ends say what it runs over, and each
// mark's shape says which way its range went.
describe('IdentityCard strip, labelled and not colour-only (roadmap D47)', () => {
  const buckets = [
    strip(40, 'calibrated'),
    strip(60, 'underconfident'),
    strip(80, 'overconfident', 30),
  ];

  it('marks each range by shape, an empty one by a dash, between 0% and 100%', () => {
    render(<IdentityCard card={CARD} format="post" buckets={buckets} />);
    for (const id of [
      'card-strip-0-empty',
      'card-strip-20-empty',
      'card-strip-40-calibrated',
      'card-strip-60-underconfident',
      'card-strip-80-overconfident',
    ]) {
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(screen.getByText('0%', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('100%', { includeHiddenElements: true })).toBeTruthy();
  });

  it('says the strip in words to VoiceOver, inside the card’s one label', () => {
    render(<IdentityCard card={CARD} format="post" buckets={buckets} />);
    const label = screen.getByRole('image').props.accessibilityLabel as string;
    expect(label).toContain(
      'By range, low to high: 40 to 60%, no clear lean; 60 to 80%, too cautious; 80 to 100%, too sure.',
    );
  });

  // Roadmap D58: under 10 answers a range has no lean mark, only a grey dot,
  // and its words agree.
  it('marks a range under 10 answers neutrally, not by its lean', () => {
    render(
      <IdentityCard
        card={CARD}
        format="post"
        buckets={[strip(60, 'underconfident', 9), strip(80, 'overconfident', 30)]}
      />,
    );
    expect(screen.getByTestId('card-strip-60-thin', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('card-strip-60-underconfident', { includeHiddenElements: true })).toBeNull();
    const label = screen.getByRole('image').props.accessibilityLabel as string;
    expect(label).toContain('60 to 80%, too few to read yet; 80 to 100%, too sure.');
  });

  it('marks a range by its lean from exactly 10 answers, as the text share does', () => {
    render(<IdentityCard card={CARD} format="post" buckets={[strip(80, 'overconfident', 10)]} />);
    expect(screen.getByTestId('card-strip-80-overconfident', { includeHiddenElements: true })).toBeTruthy();
  });

  // Roadmap D58 (owner, 2026-11-10): not an all-grey strip.
  it('draws no strip, and says none, while every range is under 10', () => {
    render(
      <IdentityCard
        card={CARD}
        format="post"
        buckets={[strip(60, 'underconfident', 9), strip(80, 'overconfident', 8)]}
      />,
    );
    expect(screen.queryByTestId('card-strip', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('image').props.accessibilityLabel).not.toContain('By range');
  });

  it('draws no strip, and says none, without a rating', () => {
    render(<IdentityCard card={{ ...CARD, rating: null }} format="post" buckets={buckets} />);
    expect(screen.queryByTestId('card-strip', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('image').props.accessibilityLabel).not.toContain('By range');
  });
});

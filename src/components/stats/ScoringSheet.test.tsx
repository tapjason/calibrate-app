import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, space } from '@/constants/theme';

import { ScoringSheet } from './ScoringSheet';

// Blind playtest 2026-11-12e, finding 1: opened at Badges, the × was six
// screens up in the scroll, with no tab bar to fall back on.
describe('ScoringSheet', () => {
  it('pins the × as the scroll\'s sticky first child', () => {
    const onClose = jest.fn();
    render(<ScoringSheet onClose={onClose} />);
    const scroll = screen.getByTestId('scoring-scroll');
    expect(scroll.props.stickyHeaderIndices).toEqual([0]);
    expect(screen.getByTestId('scoring-close-bar')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scoring-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets the bar off with a hairline once the text has scrolled', () => {
    render(<ScoringSheet onClose={jest.fn()} />);
    const border = () =>
      StyleSheet.flatten(screen.getByTestId('scoring-close-bar').props.style).borderBottomColor;
    expect(border()).not.toBe(colors.hairline);
    fireEvent.scroll(screen.getByTestId('scoring-scroll'), {
      nativeEvent: { contentOffset: { y: 40 } },
    });
    expect(border()).toBe(colors.hairline);
  });

  // Roadmap D27: from Today's identity line it opens at Badges, the heading
  // just under the pinned bar.
  it('opens at Badges, once, when asked', () => {
    render(<ScoringSheet onClose={jest.fn()} openAt="Badges" />);
    const scroll = screen.UNSAFE_getByProps({ testID: 'scoring-scroll' });
    const scrollTo = jest.fn();
    scroll.instance.scrollTo = scrollTo;
    const layOut = (y: number) =>
      fireEvent(screen.getByTestId('scoring-section-badges'), 'layout', {
        nativeEvent: { layout: { x: 0, y, width: 375, height: 300 } },
      });
    layOut(840);
    expect(scrollTo).toHaveBeenCalledWith({ y: 840 - space.lg, animated: false });
    // A later layout pass doesn't pull the reader back.
    layOut(900);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('stays at the top otherwise', () => {
    render(<ScoringSheet onClose={jest.fn()} />);
    const scroll = screen.UNSAFE_getByProps({ testID: 'scoring-scroll' });
    const scrollTo = jest.fn();
    scroll.instance.scrollTo = scrollTo;
    fireEvent(screen.getByTestId('scoring-section-badges'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 840, width: 375, height: 300 } },
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// Step 173: opened from Today's rating, the person's own number first. Since
// D76 from Insights' "What does this mean?" too, with every line the page
// left out, one paragraph each.
describe('ScoringSheet with the rating lines', () => {
  const lines = [
    'Your rating is 86. Range by range, what you said averaged about 14 points away from how often those things happened, each range counting by how many answers it holds.',
    'Even perfectly calibrated, 20 answers like yours would typically score about 86, since luck alone moves each range. At this count, your score can’t be told apart from perfect calibration.',
    'Give or take 3 points with this many predictions.',
    'Up 2 since last week, from 6 answers given since then, within its give⁠-⁠or⁠-⁠take.',
  ];

  it('shows them above the explainer, in order, and nothing without them', () => {
    const view = render(<ScoringSheet onClose={jest.fn()} ratingLines={lines} />);
    expect(screen.getByTestId('scoring-rating-line')).toBeTruthy();
    lines.forEach((line, i) => {
      expect(screen.getByTestId(`scoring-rating-line-${i}`)).toHaveTextContent(line);
    });
    // Its own heading, so a heading jump reaches it (step 179).
    expect(screen.getByRole('header', { name: 'Your rating' })).toBeTruthy();
    view.rerender(<ScoringSheet onClose={jest.fn()} />);
    expect(screen.queryByTestId('scoring-rating-line')).toBeNull();
    // An empty list (a provisional rating) shows no box either.
    view.rerender(<ScoringSheet onClose={jest.fn()} ratingLines={[]} />);
    expect(screen.queryByTestId('scoring-rating-line')).toBeNull();
  });
});

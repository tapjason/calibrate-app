import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, DISPLAY_MAX_SCALE, space, type } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';
import type { StreakStatus } from '@/types';

import { StreakLine } from './StreakLine';

/** The rest-day fields (step 87), with nothing to say unless a test asks. */
const NO_REST: Pick<StreakStatus, 'restDays' | 'restUsed' | 'restEarnedToday' | 'nextRestAt'> = {
  restDays: 0,
  restUsed: 0,
  restEarnedToday: false,
  nextRestAt: null,
};

describe('StreakLine (roadmap D2)', () => {
  // D17: the pips are the day's goal of three; one already counts.
  it('reads as one sentence, with the day’s goal shown as filled and hollow pips', () => {
    render(<StreakLine status={{ streak: 5, today: 1, todayCounts: true, checkpoint: null, nextCheckpoint: 7, ...NO_REST }} />);
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toBe(
      '5-day streak. Today counts. Goal:\u00A01\u00A0of\u00A03.',
    );
    const pip = (i: number) =>
      StyleSheet.flatten(screen.getByTestId(`streak-line-pip-${i}`, { includeHiddenElements: true }).props.style);
    expect(pip(0).backgroundColor).toBe(colors.action);
    expect(pip(1).backgroundColor).toBeUndefined();
    expect(pip(1).borderWidth).toBeGreaterThan(0);
  });

  it('renders nothing before there is anything to show', () => {
    render(<StreakLine status={{ streak: 0, today: 0, todayCounts: false, checkpoint: null, nextCheckpoint: 7, ...NO_REST }} />);
    expect(screen.queryByTestId('streak-line')).toBeNull();
  });

  // Decided 2026-10-06: checkpoints at 7, 30, 100 and 365 days.
  it('takes the milestone tint on a checkpoint day, and only then', () => {
    const { rerender } = render(
      <StreakLine status={{ streak: 30, today: 3, todayCounts: true, checkpoint: 30, nextCheckpoint: 100, ...NO_REST }} />,
    );
    const row = () => StyleSheet.flatten(screen.getByTestId('streak-line').props.style);
    expect(row().backgroundColor).toBe(colors.selectedFill);
    expect(screen.getByTestId('streak-line-detail')).toHaveTextContent(
      'A full month.\nNext milestone: 100\u00A0days',
    );

    rerender(
      <StreakLine status={{ streak: 31, today: 3, todayCounts: true, checkpoint: null, nextCheckpoint: 100, ...NO_REST }} />,
    );
    expect(row().backgroundColor).toBe(colors.surface);
  });

  // Decided 2026-10-07 (roadmap step 87).
  it('says what the rest days stand at, in the same sentence', () => {
    render(
      <StreakLine
        status={{ streak: 9, today: 0, todayCounts: false, checkpoint: null, nextCheckpoint: 30, ...NO_REST, restUsed: 1, restDays: 1 }}
      />,
    );
    expect(screen.getByTestId('streak-line-rest')).toHaveTextContent('Yesterday was a rest day. 1 more saved');
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toBe(
      '9-day streak. One prediction today makes it 10. Yesterday was a rest day. 1 more saved.',
    );
  });

  it('leaves the rest line out when there is nothing to say', () => {
    render(<StreakLine status={{ streak: 4, today: 1, todayCounts: false, checkpoint: null, nextCheckpoint: 7, ...NO_REST }} />);
    expect(screen.queryByTestId('streak-line-rest')).toBeNull();
  });
});

// Step 173 (aggregate B5): the streak and goal can be switched off in You.
describe('StreakLine switched off', () => {
  afterEach(() => useSettingsStore.setState({ streakShown: true }));
  it('draws nothing while the streak is hidden', () => {
    useSettingsStore.setState({ streakShown: false });
    render(<StreakLine status={{ streak: 5, today: 1, todayCounts: true, checkpoint: null, nextCheckpoint: 7, ...NO_REST }} />);
    expect(screen.queryByTestId('streak-line')).toBeNull();
  });
});

// Blind playtest 2026-11-13, runs 4 and 7: tapping the row explains the streak.
describe('StreakLine tapped', () => {
  it('is a button when it can explain, and a plain line otherwise', () => {
    const status = { streak: 5, today: 1, todayCounts: true, checkpoint: null, nextCheckpoint: 7, ...NO_REST };
    const onPress = jest.fn();
    const view = render(<StreakLine status={status} onPress={onPress} />);
    expect(screen.getByTestId('streak-line').props.accessibilityRole).toBe('button');
    fireEvent.press(screen.getByTestId('streak-line'));
    expect(onPress).toHaveBeenCalledTimes(1);
    view.rerender(<StreakLine status={status} />);
    expect(screen.getByTestId('streak-line').props.accessibilityRole).toBe('text');
  });
});

// Step 193 (D67): a clearer streak, still ink. The flame's shape says whether
// today counts, the count is its own figure, and the goal dots are named.
describe('StreakLine, clearer (step 193)', () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  const flame = () => screen.getByTestId('streak-line-flame', HIDDEN);
  const running = (s: Partial<StreakStatus>): StreakStatus => ({
    streak: 149,
    today: 0,
    todayCounts: false,
    checkpoint: null,
    nextCheckpoint: 365,
    ...NO_REST,
    ...s,
  });

  it('draws an outline flame in the secondary grey before today counts', () => {
    render(<StreakLine status={running({})} />);
    expect(flame().props.name).toBe('flame');
    expect(flame().props.fallback.props.name).toBe('flame-outline');
    expect(flame().props.tintColor).toEqual(colors.textSecondary);
    expect(flame().props.fallback.props.color).toEqual(colors.textSecondary);
    expect(flame().props.size).toBe(22);
  });

  it('fills the flame in ink once today counts', () => {
    render(<StreakLine status={running({ streak: 150, today: 1, todayCounts: true })} />);
    expect(flame().props.name).toBe('flame.fill');
    expect(flame().props.fallback.props.name).toBe('flame');
    expect(flame().props.tintColor).toEqual(colors.action);
  });

  it('fills it on a checkpoint day too', () => {
    render(
      <StreakLine status={running({ streak: 100, today: 1, todayCounts: true, checkpoint: 100 })} />,
    );
    expect(flame().props.name).toBe('flame.fill');
    expect(flame().props.tintColor).toEqual(colors.action);
  });

  it('shows the count as its own figure, a step above the headline, then "day streak"', () => {
    render(<StreakLine status={running({})} />);
    const count = screen.getByTestId('streak-line-count');
    expect(count.props.children).toBe('149');
    const style = StyleSheet.flatten(count.props.style);
    expect(style.fontSize).toBe(type.title3.fontSize);
    expect(style.fontWeight).toBe('700');
    expect(count.props.maxFontSizeMultiplier).toBe(DISPLAY_MAX_SCALE);
    // Held to its words by a no-break space: "149 day streak".
    expect(screen.getByTestId('streak-line-headline').props.children[1]).toBe('\u00A0day streak');
    expect(screen.getByTestId('streak-line-headline')).toHaveTextContent('149 day streak');
    // VoiceOver keeps "149-day streak".
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toBe(
      '149-day streak. One prediction today makes it 150.',
    );
  });

  // Security review, 2026-11-18: at AX5 the figure, capped at 1.6×, came out
  // about half the size of its uncapped " day streak". Both now share the cap,
  // so the figure (title3) stays the larger at every size.
  it('caps the words beside the count as the count is capped, so the count stays larger', () => {
    render(<StreakLine status={running({})} />);
    const count = screen.getByTestId('streak-line-count');
    const headline = screen.getByTestId('streak-line-headline');
    expect(count.props.maxFontSizeMultiplier).toBe(DISPLAY_MAX_SCALE);
    expect(headline.props.maxFontSizeMultiplier).toBe(DISPLAY_MAX_SCALE);
    expect(headline.props.maxFontSizeMultiplier).toBe(count.props.maxFontSizeMultiplier);
    // The same base sizes, so the same cap keeps the figure the larger.
    expect(StyleSheet.flatten(count.props.style).fontSize).toBeGreaterThan(
      StyleSheet.flatten(headline.props.style).fontSize as number,
    );
    // The spoken sentence is as it was.
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toBe(
      '149-day streak. One prediction today makes it 150.',
    );
  });

  it('keeps the same cap while the count rolls up on a checkpoint', () => {
    render(
      <StreakLine
        status={running({ streak: 7, today: 1, todayCounts: true, checkpoint: 7 })}
        moment={{ days: 7, play: true }}
      />,
    );
    const count = screen.getByTestId('streak-line-count');
    expect(count.props.maxFontSizeMultiplier).toBe(DISPLAY_MAX_SCALE);
    expect(screen.getByTestId('streak-line-headline').props.maxFontSizeMultiplier).toBe(
      DISPLAY_MAX_SCALE,
    );
  });

  it('names the goal dots under them, hidden from VoiceOver with the dots', () => {
    render(<StreakLine status={running({ streak: 150, today: 2, todayCounts: true })} />);
    expect(screen.queryByTestId('streak-line-goal-name')).toBeNull();
    const name = screen.getByTestId('streak-line-goal-name', HIDDEN);
    expect(name).toHaveTextContent("Today's goal");
    expect(StyleSheet.flatten(name.props.style).fontSize).toBe(type.caption.fontSize);
    expect(StyleSheet.flatten(name.props.style).color).toEqual(colors.textTertiary);
    const goal = screen.getByTestId('streak-line-goal', HIDDEN);
    expect(goal.props.accessibilityElementsHidden).toBe(true);
    expect(goal.props.importantForAccessibility).toBe('no-hide-descendants');
    // The dots and their name are one piece, so they wrap together.
    expect(screen.getByTestId('streak-line-pip-0', HIDDEN)).toBeTruthy();
    expect(goal).toContainElement(screen.getByTestId('streak-line-pip-2', HIDDEN));
    expect(goal).toContainElement(name);
  });

  // The quietest grey is 4.4:1 on the checkpoint tint, under the text floor.
  it('takes the secondary grey for its quiet lines on the checkpoint tint', () => {
    render(
      <StreakLine
        status={running({ streak: 7, today: 1, todayCounts: true, checkpoint: 7, nextCheckpoint: 30, restDays: 1, restEarnedToday: true })}
      />,
    );
    const color = (id: string) => StyleSheet.flatten(screen.getByTestId(id, HIDDEN).props.style).color;
    expect(color('streak-line-goal-name')).toEqual(colors.textSecondary);
    expect(color('streak-line-rest')).toEqual(colors.textSecondary);
    // And a hollow dot's edge, 2.8:1 there in controlBorder, under the 3:1 floor.
    const pip = StyleSheet.flatten(screen.getByTestId('streak-line-pip-1', HIDDEN).props.style);
    expect(pip.borderColor).toEqual(colors.textTertiary);
  });

  // D68 (Today A): on Today the practice row follows as the streak row's pair.
  it('keeps 16 below on its own and 8 as the practice row’s pair, on the row itself', () => {
    const below = () =>
      StyleSheet.flatten(screen.getByTestId('streak-line-moment').props.style).marginBottom;
    const view = render(<StreakLine status={running({})} />);
    expect(below()).toBe(space.lg);
    view.rerender(<StreakLine status={running({})} paired />);
    expect(below()).toBe(space.sm);
    // The same on a checkpoint day and for a streak that ended.
    view.rerender(<StreakLine status={running({ streak: 7, today: 1, todayCounts: true, checkpoint: 7, nextCheckpoint: 30 })} paired />);
    expect(below()).toBe(space.sm);
    view.rerender(
      <StreakLine status={running({ streak: 0, ended: { days: 151, on: '2026-11-12T00:00:00', ago: 1 } })} paired />,
    );
    expect(below()).toBe(space.sm);
    // Hidden, it leaves nothing behind, so no gap either.
    view.rerender(<StreakLine status={running({ streak: 0 })} paired />);
    expect(screen.queryByTestId('streak-line-moment')).toBeNull();
  });

  it('keeps the sentence of a streak that ended, with a quiet outline flame and no goal', () => {
    render(
      <StreakLine
        status={running({ streak: 0, ended: { days: 151, on: '2026-11-12T00:00:00', ago: 1 } })}
      />,
    );
    expect(screen.getByTestId('streak-line-headline')).toHaveTextContent(
      'Your 151-day streak ended yesterday',
    );
    expect(screen.queryByTestId('streak-line-count', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('streak-line-goal', HIDDEN)).toBeNull();
    expect(flame().props.name).toBe('flame');
    expect(flame().props.tintColor).toEqual(colors.textTertiary);
  });
});

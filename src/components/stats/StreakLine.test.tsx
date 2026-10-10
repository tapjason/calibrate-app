import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';
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
    expect(pip(0).backgroundColor).toBe(colors.brand600);
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
    expect(row().backgroundColor).toBe(colors.brand50);
    expect(screen.getByTestId('streak-line-detail')).toHaveTextContent(
      'A full month. Next\u00A0milestone: 100\u00A0days',
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

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

import { StreakLine } from './StreakLine';

describe('StreakLine (roadmap D2)', () => {
  it('reads as one sentence, with today shown as filled and hollow pips', () => {
    render(<StreakLine status={{ streak: 4, today: 1, todayCounts: false }} />);
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toBe(
      '4-day streak. 2 more today makes it 5.',
    );
    const pip = (i: number) =>
      StyleSheet.flatten(screen.getByTestId(`streak-line-pip-${i}`, { includeHiddenElements: true }).props.style);
    expect(pip(0).backgroundColor).toBe(colors.brand600);
    expect(pip(1).backgroundColor).toBeUndefined();
    expect(pip(1).borderWidth).toBeGreaterThan(0);
  });

  it('renders nothing before there is anything to show', () => {
    render(<StreakLine status={{ streak: 0, today: 0, todayCounts: false }} />);
    expect(screen.queryByTestId('streak-line')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react-native';

import { UnlockProgress } from './UnlockProgress';

describe('UnlockProgress', () => {
  // Roadmap D30: before the first answer, the nearest thing comes first.
  it('leads with when the first answer comes, and says it to a screen reader', () => {
    render(
      <UnlockProgress
        resolved={0}
        pending={1}
        total={20}
        lead="Your first answer: tomorrow evening"
        testID="progress"
      />,
    );
    expect(screen.getByTestId('progress-lead')).toHaveTextContent('Your first answer: tomorrow evening');
    expect(screen.getByTestId('progress').props.accessibilityLabel).toBe(
      'Calibrating. Your first answer: tomorrow evening. 0 of 20 resolved, 1 on its way.',
    );
  });

  // Roadmap D53 (blind playtest 2026-11-09b, finding 2).
  it('says when it could unlock at the recent pace, on screen and aloud', () => {
    const line = 'At your recent pace, about 3 weeks (around Nov 30).';
    render(<UnlockProgress resolved={7} pending={2} total={20} estimate={line} testID="progress" />);
    expect(screen.getByTestId('progress-estimate')).toHaveTextContent(line);
    expect(screen.getByTestId('progress').props.accessibilityLabel).toMatch(/about 3 weeks/);
  });

  it('has no lead once answers have come in', () => {
    render(<UnlockProgress resolved={4} pending={2} total={20} testID="progress" />);
    expect(screen.queryByTestId('progress-lead')).toBeNull();
    expect(screen.getByText('16 more resolutions and your score unlocks.')).toBeTruthy();
  });
});

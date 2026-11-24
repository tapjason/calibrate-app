import { render, screen } from '@testing-library/react-native';

import { UnlockProgress } from './UnlockProgress';

describe('UnlockProgress', () => {
  // Roadmap D30: before the first answer, the nearest thing comes first. D76
  // (the voice pass, 2026-11-23): one line where there were three.
  it('leads with when the first answer comes, in one line, and says it to a screen reader', () => {
    render(
      <UnlockProgress
        resolved={0}
        pending={1}
        total={20}
        lead="Your first answer lands tomorrow evening."
        testID="progress"
      />,
    );
    expect(screen.getByTestId('progress-lead')).toHaveTextContent(
      'Your first answer lands tomorrow evening. 20 answers unlock your score.',
    );
    expect(screen.queryByTestId('progress-line')).toBeNull();
    expect(screen.queryByText(/of 20 scored|on its way/)).toBeNull();
    expect(screen.getByTestId('progress').props.accessibilityLabel).toBe(
      'Calibrating. Your first answer lands tomorrow evening. 20 answers unlock your score.',
    );
  });

  // Roadmap D53 (blind playtest 2026-11-09b, finding 2).
  it('says when it could unlock at the recent pace, on screen and aloud', () => {
    const line = 'At your recent pace, about 3 weeks (around Nov 30).';
    render(<UnlockProgress resolved={7} pending={2} total={20} estimate={line} testID="progress" />);
    expect(screen.getByTestId('progress-estimate')).toHaveTextContent(line);
    expect(screen.getByTestId('progress').props.accessibilityLabel).toMatch(/about 3 weeks/);
  });

  it('once answers have come in, says how many scored answers are to go, with when the next comes due', () => {
    render(
      <UnlockProgress
        resolved={4}
        pending={2}
        total={20}
        nextDue="The next one comes due Thu, Nov 26."
        testID="progress"
      />,
    );
    expect(screen.queryByTestId('progress-lead')).toBeNull();
    expect(screen.getByTestId('progress-line')).toHaveTextContent(
      '16 more scored answers unlock your score. The next one comes due Thu, Nov 26.',
    );
    expect(screen.getByTestId('progress').props.accessibilityLabel).toBe(
      'Calibrating. 16 more scored answers unlock your score. The next one comes due Thu, Nov 26.',
    );
    expect(screen.getByTestId('progress').props.accessibilityValue).toEqual({ min: 0, max: 20, now: 4 });
  });

  it('counts the last one in the singular', () => {
    render(<UnlockProgress resolved={19} pending={0} total={20} testID="progress" />);
    expect(screen.getByTestId('progress-line')).toHaveTextContent(
      '1 more scored answer unlocks your score.',
    );
  });
});

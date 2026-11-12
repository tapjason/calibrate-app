import { fireEvent, render, screen } from '@testing-library/react-native';

import type { WarmupQuestion } from '@/types';

import { AnswerKeyRow } from './AnswerKeyRow';

const QUESTION: WarmupQuestion = {
  id: 'q1',
  prompt: 'Which is longer?',
  options: ['A blue whale', 'A Boeing 737'],
  correctIndex: 1,
  fact: 'A 737 is about 40m.',
};

const at = (fontScale: number) =>
  jest
    // The hook's own module: react-native's index re-exports it by getter.
    .spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default')
    .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale });

// Blind playtest 2026-11-12e, finding 12: at double text size the tick and
// the percent either side left the text one word a line.
describe('AnswerKeyRow', () => {
  afterEach(() => jest.restoreAllMocks());

  const spoken =
    'Which is longer? A Boeing 737. You picked “A blue whale”, 80% sure. A 737 is about 40m.';

  it('sets the tick and percent either side of the text at the default size', () => {
    at(1);
    render(<AnswerKeyRow question={QUESTION} answer={{ confidence: 80, correct: false }} testID="k" />);
    fireEvent(screen.getByTestId('k'), 'layout', { nativeEvent: { layout: { width: 240 } } });
    expect(screen.queryByTestId('k-marks')).toBeNull();
    expect(screen.getByTestId('k').props.style).toMatchObject({ flexDirection: 'row' });
    expect(screen.getByTestId('k').props.accessibilityLabel).toBe(spoken);
  });

  it('puts them on a line above the text at a large size, read the same', () => {
    at(2);
    render(<AnswerKeyRow question={QUESTION} answer={{ confidence: 80, correct: false }} testID="k" />);
    expect(screen.getByTestId('k-marks')).toHaveTextContent('80%');
    expect(screen.getByTestId('k').props.style).not.toMatchObject({ flexDirection: 'row' });
    expect(screen.getByTestId('k').props.accessibilityLabel).toBe(spoken);
    expect(screen.getByTestId('k-answer')).toHaveTextContent(/^A Boeing 737\. You picked /);
  });

  it('stacks a little larger once the row turns out narrow', () => {
    at(1.235);
    render(<AnswerKeyRow question={QUESTION} answer={{ confidence: 80, correct: true }} testID="k" />);
    expect(screen.queryByTestId('k-marks')).toBeNull();
    fireEvent(screen.getByTestId('k'), 'layout', { nativeEvent: { layout: { width: 280 } } });
    expect(screen.getByTestId('k-marks')).toBeTruthy();
  });
});

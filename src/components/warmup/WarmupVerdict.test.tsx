import { fireEvent, render, screen } from '@testing-library/react-native';

import { scoreWarmup } from '@/engine/warmup';
import { useWarmupStore } from '@/store/warmupStore';
import type { WarmupAnswer, WarmupQuestion } from '@/types';

import { WarmupVerdictScreen } from './WarmupVerdict';

const QUESTIONS: readonly WarmupQuestion[] = [
  {
    id: 'q1',
    prompt: 'Which is longer?',
    options: ['A blue whale', 'A Boeing 737'],
    correctIndex: 1,
    fact: 'A 737 is about 40m.',
  },
  {
    id: 'q2',
    prompt: 'Which is deeper?',
    options: ['Atlantic', 'Pacific'],
    correctIndex: 1,
    fact: 'The Mariana Trench is in the Pacific.',
  },
];

/** Confident and wrong half the time — the overconfident case. */
const ANSWERS: WarmupAnswer[] = [
  { confidence: 90, correct: true },
  { confidence: 90, correct: false },
];

function seed(answers: WarmupAnswer[]): void {
  useWarmupStore.setState({
    questions: QUESTIONS,
    index: answers.length,
    answers,
    result: scoreWarmup(answers),
    completedAt: '2026-08-29T12:00:00.000Z',
    hydrated: true,
  });
}

describe('WarmupVerdictScreen', () => {
  it('headlines the verdict with the mini score and chart', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(screen.getByText('You run overconfident')).toBeTruthy();
    expect(
      screen.getByText('You were 90% confident on average, and right 50% of the time.'),
    ).toBeTruthy();
    expect(screen.getByTestId('calibration-chart')).toBeTruthy();
  });

  // CLAUDE.md: the Warmup delivers the aha, but it is not the user's real
  // calibration rating — the screen has to say so.
  it('marks the score as a warm-up, not a calibration rating', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(
      screen.getByText(/warm-up score, not your calibration rating/),
    ).toBeTruthy();
    expect(screen.getByText(/20 resolved predictions/)).toBeTruthy();
  });

  it('shows the answer key with the fact behind each question', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(screen.getByTestId('warmup-key-q1')).toBeTruthy();
    expect(screen.getByText('A 737 is about 40m.')).toBeTruthy();
    expect(screen.getByText('The Mariana Trench is in the Pacific.')).toBeTruthy();
  });

  it('hands control back on continue', () => {
    seed(ANSWERS);
    const onContinue = jest.fn();
    render(<WarmupVerdictScreen onContinue={onContinue} />);

    fireEvent.press(screen.getByTestId('warmup-continue'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('renders nothing when the quiz has not been scored', () => {
    useWarmupStore.setState({
      questions: QUESTIONS,
      index: 0,
      answers: [],
      result: null,
      completedAt: null,
      hydrated: true,
    });
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.queryByTestId('warmup-verdict')).toBeNull();
  });
});

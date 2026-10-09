import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
  // The score rolls up on requestAnimationFrame; fake timers keep that inside
  // the test instead of updating after it has finished.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rolls the score up from 0 and lands on it', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    const expected = Math.round(useWarmupStore.getState().result!.mini_score);
    expect(screen.getByTestId('warmup-score').props.accessibilityLabel).toBe(String(expected));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('warmup-score').props.children).toBe(expected);
  });

  it('headlines the verdict with the mini score and chart', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(screen.getByText(/you were overconfident/)).toBeTruthy();
    expect(
      screen.getByText('You said 90% on average. 1 of 2 were right.'),
    ).toBeTruthy();
    expect(screen.getByTestId('calibration-chart')).toBeTruthy();
  });

  // Roadmap D18 (3).
  it('bridges to the person\'s own plans', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.getByTestId('warmup-bridge')).toHaveTextContent(/thesis in 34 days took 56/);
    expect(screen.getByText('Predict something about tomorrow')).toBeTruthy();
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

  // Roadmap step 71: "✗ Which is longer? A Boeing 737" read as though the
  // 737 had been the wrong pick. The right answer and the pick are words now.
  it('says the right answer and, for a miss, what was picked', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(screen.getByTestId('warmup-key-q1-answer')).toHaveTextContent('A Boeing 737 · You got it');
    expect(screen.getByTestId('warmup-key-q2-answer')).toHaveTextContent(
      'Pacific · You picked \u201CAtlantic\u201D',
    );
    expect(screen.getByTestId('warmup-key-q2').props.accessibilityLabel).toBe(
      'Which is deeper? Pacific. You picked \u201CAtlantic\u201D, 90% sure. The Mariana Trench is in the Pacific.',
    );
    expect(screen.queryByText('✗')).toBeNull();
  });

  it('hands control back on continue', () => {
    seed(ANSWERS);
    const onContinue = jest.fn();
    render(<WarmupVerdictScreen onContinue={onContinue} />);

    fireEvent.press(screen.getByTestId('warmup-continue'));
    expect(onContinue).toHaveBeenCalled();
  });

  // The Warmup produces the first shareable card (CLAUDE.md, Warmup module).
  it('offers to share the result when a share route is given', () => {
    seed(ANSWERS);
    const onShare = jest.fn();
    render(<WarmupVerdictScreen onContinue={jest.fn()} onShare={onShare} />);

    fireEvent.press(screen.getByTestId('warmup-share'));
    expect(onShare).toHaveBeenCalled();
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

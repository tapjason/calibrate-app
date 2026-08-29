import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useWarmupStore } from '@/store/warmupStore';
import type { WarmupQuestion } from '@/types';

import { WarmupQuiz } from './WarmupQuiz';

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

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useWarmupStore.setState({
    questions: QUESTIONS,
    index: 0,
    answers: [],
    result: null,
    completedAt: null,
    hydrated: true,
  });
});

afterEach(() => {
  setDbForTests(null);
});

describe('WarmupQuiz', () => {
  it('shows the current question and progress', () => {
    render(<WarmupQuiz />);
    expect(screen.getByText('Which is longer?')).toBeTruthy();
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
  });

  it('requires an answer before advancing', () => {
    render(<WarmupQuiz />);
    fireEvent.press(screen.getByTestId('warmup-next'));
    expect(useWarmupStore.getState().answers).toEqual([]);
  });

  it('records the picked option and stated confidence', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-1')); // correct
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 80
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(useWarmupStore.getState().answers).toEqual([
        { confidence: 80, correct: true },
      ]);
    });
  });

  it('marks a wrong pick incorrect and moves to the next question', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-0')); // wrong
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(screen.getByText('Which is deeper?')).toBeTruthy();
    });
    expect(useWarmupStore.getState().answers).toEqual([
      { confidence: 75, correct: false },
    ]);
  });

  it('resets the confidence stepper between questions so answers are independent', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-0'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 85
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(screen.getByText('How sure are you? 75%')).toBeTruthy();
    });
  });

  it('holds confidence inside the 50–100 range', () => {
    render(<WarmupQuiz />);
    for (let i = 0; i < 8; i++) {
      fireEvent.press(screen.getByTestId('warmup-confidence-decrement'));
    }
    expect(screen.getByText('How sure are you? 50%')).toBeTruthy();

    for (let i = 0; i < 20; i++) {
      fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    }
    expect(screen.getByText('How sure are you? 100%')).toBeTruthy();
  });

  it('labels the last question as the finish and scores on submit', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-1'));
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(screen.getByTestId('warmup-next')).toBeTruthy();
    });
    expect(screen.getByText('See my result')).toBeTruthy();

    fireEvent.press(screen.getByTestId('warmup-option-1'));
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(useWarmupStore.getState().result?.answered).toBe(2);
    });
    expect(useWarmupStore.getState().completedAt).not.toBeNull();
  });
});

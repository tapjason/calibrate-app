import { AccessibilityInfo } from 'react-native';
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
    // Visible progress, hidden from screen readers: the heading says it.
    expect(screen.getByText('Question 1 of 2', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('warmup-prompt').props.accessibilityLabel).toBe(
      'Question 1 of 2. Which is longer?',
    );
  });

  // Roadmap step 44: Next swaps the question while focus stays on the button.
  it('announces each new question to screen readers, but not the first', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<WarmupQuiz />);
    expect(announce).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('warmup-option-0'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    fireEvent.press(screen.getByTestId('warmup-next'));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith('Question 2 of 2. Which is deeper?'),
    );
    announce.mockRestore();
  });

  it('requires an answer before advancing', () => {
    render(<WarmupQuiz />);
    fireEvent.press(screen.getByTestId('warmup-next'));
    expect(useWarmupStore.getState().answers).toEqual([]);
  });

  // Roadmap D13: nothing preset. Tapping through used to answer "75%".
  it('starts with no confidence and waits for one before Next', () => {
    render(<WarmupQuiz />);
    expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('—%');
    expect(screen.getByText('not set yet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('warmup-option-1'));
    expect(screen.getByTestId('warmup-next').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(screen.getByTestId('warmup-next'));
    expect(useWarmupStore.getState().answers).toEqual([]);

    // The first ±5 steps from the middle of 50–100.
    fireEvent.press(screen.getByTestId('warmup-confidence-decrement'));
    expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('70%');
    expect(screen.getByTestId('warmup-next').props.accessibilityState).toMatchObject({
      disabled: false,
    });
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
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 80
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(screen.getByText('Which is deeper?')).toBeTruthy();
    });
    expect(useWarmupStore.getState().answers).toEqual([
      { confidence: 80, correct: false },
    ]);
  });

  it('resets the confidence stepper between questions so answers are independent', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-0'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 85
    fireEvent.press(screen.getByTestId('warmup-next'));

    // Empty again, not carried over and not preset.
    await waitFor(() => {
      expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('—%');
    });
  });

  it('holds confidence inside the 50–100 range', () => {
    render(<WarmupQuiz />);
    for (let i = 0; i < 8; i++) {
      fireEvent.press(screen.getByTestId('warmup-confidence-decrement'));
    }
    expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('50%');

    for (let i = 0; i < 20; i++) {
      fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    }
    expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('100%');
  });

  it('labels the last question as the finish and scores on submit', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-1'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(screen.getByText('See my result')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('warmup-option-1'));
    fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
    fireEvent.press(screen.getByTestId('warmup-next'));

    await waitFor(() => {
      expect(useWarmupStore.getState().result?.answered).toBe(2);
    });
    expect(useWarmupStore.getState().completedAt).not.toBeNull();
  });
});

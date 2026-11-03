import { AccessibilityInfo, ScrollView } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { space } from '@/constants/theme';
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

  // Playtests 2026-11-01 and 2026-11-03: at 375 × 667 the confidence control
  // sat below the fold on the first question. Picking an answer brings it in.
  describe('bringing the confidence control into view', () => {
    const layOut = (viewport: number) => {
      const scroll = screen.UNSAFE_getByType(ScrollView);
      fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: viewport } } });
      fireEvent(screen.getByTestId('warmup-quiz'), 'layout', { nativeEvent: { layout: { y: 300 } } });
      fireEvent(screen.getByTestId('warmup-confidence-block'), 'layout', {
        nativeEvent: { layout: { y: 200, height: 120 } },
      });
      const scrollTo = jest.fn();
      scroll.instance.scrollTo = scrollTo;
      return scrollTo;
    };

    it('scrolls just far enough when it is out of sight', () => {
      render(<WarmupQuiz />);
      const scrollTo = layOut(500);
      fireEvent.press(screen.getByTestId('warmup-option-0'));
      // Its bottom is at 300 + 200 + 120 = 620; a 500-high view shows 0–500.
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ y: 620 - 500 + space.lg }),
      );
    });

    it("forgets the last question's scroll on the next one", async () => {
      render(<WarmupQuiz />);
      const first = layOut(500);
      fireEvent.press(screen.getByTestId('warmup-option-0'));
      expect(first).toHaveBeenCalledTimes(1);
      // Scrolled well down on question 1, then on to question 2.
      fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
        nativeEvent: { contentOffset: { y: 900 } },
      });
      fireEvent.press(screen.getByTestId('warmup-confidence-increment'));
      fireEvent.press(screen.getByTestId('warmup-next'));
      await waitFor(() =>
        expect(screen.getByTestId('warmup-prompt')).toHaveTextContent('Which is deeper?'),
      );
      const second = layOut(500);
      fireEvent.press(screen.getByTestId('warmup-option-0'));
      expect(second).toHaveBeenCalledWith(expect.objectContaining({ y: 620 - 500 + space.lg }));
    });

    it('leaves the scroll alone when it is already visible', () => {
      render(<WarmupQuiz />);
      const scrollTo = layOut(800);
      fireEvent.press(screen.getByTestId('warmup-option-0'));
      expect(scrollTo).not.toHaveBeenCalled();
    });
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

    // The first ±5 steps from the middle of 50–100, where the thumb rests (D36).
    fireEvent.press(screen.getByTestId('warmup-confidence-decrement'));
    expect(screen.getByTestId('warmup-confidence-readout')).toHaveTextContent('70%');
    expect(screen.getByTestId('warmup-next').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('records the picked option and stated confidence', async () => {
    render(<WarmupQuiz />);

    fireEvent.press(screen.getByTestId('warmup-option-1')); // correct
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 80, a step from 75
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
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 80, a step from 75
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
    fireEvent.press(screen.getByTestId('warmup-confidence-increment')); // 80
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

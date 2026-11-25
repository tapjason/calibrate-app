import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { usePracticeStore } from '@/store/practiceStore';
import { PRACTICE_MIN_N, type PracticeAnswer, type PracticeFacts } from '@/types';

import { PracticeCard } from './PracticeCard';
import { PracticeQuiz } from './PracticeQuiz';
import { PracticeResult } from './PracticeResult';

const FACTS: PracticeFacts = {
  places: [
    { name: 'Rome', lat: 41.9, lon: 12.5 },
    { name: 'Madrid', lat: 40.42, lon: -3.7 },
  ],
  countries: [
    { name: 'Spain', value: 505_990 },
    { name: 'Germany', value: 357_114 },
  ],
  mountains: [],
  bodies: [],
  events: [],
  people: [
    { name: 'Charles Darwin', born: 1809 },
    { name: 'Marie Curie', born: 1867 },
  ],
  elements: [],
};

const today = () => usePracticeStore.getState().today();

beforeEach(async () => {
  setDbForTests(await createTestDb());
  usePracticeStore.setState({ facts: FACTS, answers: [], hydrated: true });
});

afterEach(() => {
  setDbForTests(null);
});

/** Answer all of today's questions, the first two right and the last wrong. */
async function answerToday(confidence = 80) {
  const day = today();
  const qs = usePracticeStore.getState().questionsFor(day);
  for (const [slot, q] of qs.entries()) {
    const right = slot < qs.length - 1;
    const picked = right ? q.correctIndex : q.correctIndex === 0 ? 1 : 0;
    await usePracticeStore.getState().answer(day, slot, picked as 0 | 1, confidence);
  }
}

describe('PracticeCard (roadmap step 88)', () => {
  it("says what's waiting, and opens the sheet", () => {
    const onOpen = jest.fn();
    render(<PracticeCard onOpen={onOpen} />);
    expect(screen.getByTestId('practice-card-title')).toHaveTextContent('Today’s trivia');
    expect(screen.getByTestId('practice-card-action')).toHaveTextContent('Start');
    fireEvent.press(screen.getByTestId('practice-card'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('follows the answers as they come', async () => {
    render(<PracticeCard onOpen={() => {}} />);
    await act(async () => {
      await usePracticeStore.getState().answer(today(), 0, 0, 70);
    });
    expect(screen.getByTestId('practice-card-detail')).toHaveTextContent('1 of 3 answered');
    expect(screen.getByTestId('practice-card-action')).toHaveTextContent('Continue');
    await act(async () => {
      await answerToday();
    });
    expect(screen.getByTestId('practice-card-title')).toHaveTextContent('Trivia done');
    expect(screen.queryByTestId('practice-card-action')).toBeNull();
    expect(screen.getByTestId('practice-card').props.accessibilityHint).toBe('See answers');
    expect(screen.getByTestId('practice-card').props.accessibilityLabel).toBe(
      'Trivia done. 2 of 3 right. New ones tomorrow.',
    );
  });
});

describe('PracticeQuiz', () => {
  it('waits for an answer and a number, then stores it', async () => {
    const day = today();
    render(<PracticeQuiz day={day} slot={0} />);
    const q = usePracticeStore.getState().questionsFor(day)[0]!;
    expect(screen.getByTestId('practice-prompt')).toHaveTextContent(q.prompt);
    expect(screen.getByTestId('practice-next')).toBeDisabled();

    fireEvent.press(screen.getByTestId(`practice-option-${q.correctIndex}`));
    // Nothing preset (D13): an answer alone isn't enough.
    expect(screen.getByTestId('practice-next')).toBeDisabled();
    fireEvent.press(screen.getByTestId('practice-confidence-increment'));
    expect(screen.getByTestId('practice-next')).toBeEnabled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('practice-next'));
    });
    expect(usePracticeStore.getState().answersFor(day)).toMatchObject([{ slot: 0, correct: true }]);
  });

  // Blind playtest 2026-11-09b, finding 16: Next below the fold at 320 × 568.
  it('asks for Next to be brought into view once an answer is picked', () => {
    const day = today();
    const reveal = jest.fn();
    render(<PracticeQuiz day={day} slot={0} reveal={reveal} />);
    const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 320, height } } });
    fireEvent(screen.getByTestId('practice-quiz'), 'layout', layout(20, 600));
    fireEvent(screen.getByTestId('practice-next-box'), 'layout', layout(540, 50));

    fireEvent.press(screen.getByTestId('practice-option-0'));
    expect(reveal).toHaveBeenCalledWith(610);
  });

  it('names the last button for what it shows', () => {
    render(<PracticeQuiz day={today()} slot={2} />);
    expect(screen.getByTestId('practice-next')).toHaveTextContent('See answers');
  });

  // The owner, 2026-11-23: the scale runs 0–100, empty reads "Slide to set", and
  // a number under 50 is taken as said.
  it('starts empty, says what 50% means, and keeps a number under 50 as said', async () => {
    const day = today();
    render(<PracticeQuiz day={day} slot={0} />);
    expect(screen.getByTestId('practice-confidence-readout')).toHaveTextContent('Slide to set');
    expect(screen.getByText('50% means no idea, a coin flip.')).toBeTruthy();
    const q = usePracticeStore.getState().questionsFor(day)[0]!;
    fireEvent.press(screen.getByTestId(`practice-option-${q.correctIndex}`));
    fireEvent.press(screen.getByTestId('practice-confidence-decrement')); // 45, a step from the coin flip
    fireEvent.press(screen.getByTestId('practice-confidence-decrement')); // 40
    expect(screen.getByTestId('practice-confidence-readout')).toHaveTextContent('40%');
    await act(async () => {
      fireEvent.press(screen.getByTestId('practice-next'));
    });
    expect(usePracticeStore.getState().answersFor(day)).toMatchObject([
      { slot: 0, confidence: 40, correct: true },
    ]);
  });

  // Code review 2026-11-23, round 2: VoiceOver hears what 50% means with the
  // label, and no custom hint replaces iOS's own "swipe up or down to adjust".
  it('says what 50% means with the label, with no custom hint', () => {
    render(<PracticeQuiz day={today()} slot={0} />);
    const adjustable = screen.getByTestId('practice-confidence-adjustable');
    expect(adjustable.props.accessibilityLabel).toBe(
      'How sure are you? 50% means no idea, a coin flip.',
    );
    expect(adjustable.props.accessibilityHint).toBeUndefined();
    // No tap tip on practice.
    expect(screen.queryByText(/Tap the bar/)).toBeNull();
  });
});

describe('PracticeResult', () => {
  it('counts the day, keys each answer, and says how far the record has to go', async () => {
    await answerToday(80);
    render(<PracticeResult day={today()} />);
    expect(screen.getByTestId('practice-result-title')).toHaveTextContent('2 of 3 right');
    expect(screen.getByTestId('practice-result-detail')).toHaveTextContent('You expected 2\u00A0or\u00A03.');
    expect(screen.getByTestId('practice-key-0')).toBeTruthy();
    expect(screen.getByTestId('practice-key-2').props.accessibilityLabel).toMatch(/^.+\? .+\. You picked/);
    expect(screen.getByTestId('practice-record-headline')).toHaveTextContent('3 answered over 1 day.');
    expect(screen.getByTestId('practice-record-detail')).toHaveTextContent(
      `${PRACTICE_MIN_N - 3} more and this shows which way you lean.`,
    );
    expect(
      screen.getByText('Trivia is just for fun. It doesn’t touch your rating, badges or streak.'),
    ).toBeTruthy();
  });

  it('says which way the record leans once there are enough', async () => {
    const q = usePracticeStore.getState().questionsFor(today())[0]!;
    const past: PracticeAnswer[] = Array.from({ length: PRACTICE_MIN_N }, (_, i) => ({
      day: today() - 1 - Math.floor(i / 3),
      slot: i % 3,
      question: q,
      picked: q.correctIndex,
      correct: i < 12,
      confidence: 90,
      answered_at: '2026-10-01T12:00:00.000Z',
    }));
    usePracticeStore.setState({ answers: past });
    await answerToday(90);
    render(<PracticeResult day={today()} />);
    // By the chart's rule (record audit 2026-11-23): the range it names.
    expect(screen.getByTestId('practice-record-headline')).toHaveTextContent(
      holdRanges('In trivia, you run overconfident at 80–100%'),
    );
  });
});

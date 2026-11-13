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
  // The score rolls up on requestAnimationFrame; fake timers keep that inside
  // the test instead of updating after it has finished.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // Roadmap D19 (2026-10-09): ten answers can't carry a 0–100 number.
  it('shows no warm-up score', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.queryByTestId('warmup-score')).toBeNull();
    expect(screen.queryByText(/out of 100/)).toBeNull();
  });

  // Step 173 (blind playtest 2026-11-12f, finding 2): the expected-and-got
  // line straight under the verdict, before the buttons, where a screen reader
  // reaches it first too.
  it('says what it expected and got before the buttons', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    const ids = screen
      .UNSAFE_root.findAll((n: { props: { testID?: unknown } }) => typeof n.props.testID === 'string')
      .map((n: { props: { testID?: unknown } }) => n.props.testID as string);
    const expected = ids.indexOf('warmup-expected');
    expect(expected).toBeGreaterThan(-1);
    expect(expected).toBeLessThan(ids.indexOf('warmup-continue'));
    expect(screen.getByTestId('warmup-expected')).toHaveTextContent(/You expected about/);
  });

  // Roadmap D36: the line that answers 'so was I good?' is on the result.
  it('says it is not about being right', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.getByTestId('warmup-not-right')).toHaveTextContent(/^It isn’t about being right. /);
  });

  it('headlines the counts, the read of these answers and the chart', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    // Two answers are far too few for a lean.
    expect(screen.getByText('On these 2, no clear lean')).toBeTruthy();
    expect(
      screen.getByText('You said 90% on average. 1\u00A0of\u00A02\u00A0were\u00A0right.'),
    ).toBeTruthy();
    expect(screen.getByTestId('calibration-chart')).toBeTruthy();
  });

  // Blind playtests 2026-11-04 and 11-05: the headline and the chart's bars
  // seemed to disagree. The chart says the headline reads all ten together.
  it('says the read takes the answers together, not band by band', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.getByTestId('chart-caption')).toHaveTextContent(
      /can't be told apart from perfect calibration. A grey dot has fewer than 10 answers, too few to read yet. The read above takes all 2 together/,
    );
  });

  // Roadmap D18 (3).
  it('bridges to the person\'s own plans', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);
    expect(screen.getByTestId('warmup-bridge')).toHaveTextContent(/thesis in 34 days took 56/);
    expect(screen.getByTestId('warmup-bridge')).toHaveTextContent(/first one about tomorrow/);
    expect(screen.getByTestId('warmup-continue')).toHaveTextContent('Make a real prediction');
  });

  // CLAUDE.md: the Warmup delivers the aha, but it is not the user's real
  // calibration rating — the screen has to say so.
  it('marks the result as a warm-up, not a calibration rating', () => {
    seed(ANSWERS);
    render(<WarmupVerdictScreen onContinue={jest.fn()} />);

    expect(screen.getByText(/warm-up, not your calibration rating/)).toBeTruthy();
    expect(screen.getByText(/20 of your own predictions/)).toBeTruthy();
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

    expect(screen.getByTestId('warmup-key-q1-answer')).toHaveTextContent('A Boeing 737. You got it');
    expect(screen.getByTestId('warmup-key-q2-answer')).toHaveTextContent(
      'Pacific. You picked \u201CAtlantic\u201D',
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

  // Blind playtest 2026-11-12e, finding 14: after the ten answers, the way on
  // was a long scroll back up. The same button ends the result too.
  it('offers the way on again after the answer key', () => {
    seed(ANSWERS);
    const onContinue = jest.fn();
    render(<WarmupVerdictScreen onContinue={onContinue} />);

    expect(screen.getAllByText('Make a real prediction')).toHaveLength(2);
    const end = screen.getByTestId('warmup-continue-end');
    expect(end).toHaveTextContent('Make a real prediction');
    // It comes after the last row of the key, and the first one stays on top.
    const ids: string[] = [];
    const walk = (node: ReturnType<typeof screen.getByTestId> | string) => {
      if (typeof node === 'string') return;
      if (typeof node.props.testID === 'string') ids.push(node.props.testID);
      node.children.forEach(walk);
    };
    walk(screen.root);
    expect(ids).toEqual(
      expect.arrayContaining(['warmup-continue', 'warmup-key-q2', 'warmup-continue-end']),
    );
    expect(ids.indexOf('warmup-continue')).toBeLessThan(ids.indexOf('warmup-key-q1'));
    expect(ids.indexOf('warmup-key-q2')).toBeLessThan(ids.indexOf('warmup-continue-end'));
    fireEvent.press(end);
    expect(onContinue).toHaveBeenCalledTimes(1);
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

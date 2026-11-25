import { render, screen } from '@testing-library/react-native';

import { relativeDay } from '@/components/ui/dates';
import { useCategoryStore } from '@/store/categoryStore';
import type { Prediction } from '@/types';

import { PredictionCard, rowPosition } from './PredictionCard';

const prediction: Prediction = {
  id: 'p1',
  user_id: 'u1',
  title: 'I ship the report by Friday',
  category: 'work',
  confidence: 70,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2099-01-09T12:00:00.000Z',
  status: 'resolved_yes',
  resolved_at: '2026-01-09T12:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
};

describe('PredictionCard', () => {
  // Blind playtest 2026-11-04, third round: at a larger text size a title
  // lost its last words, the day it was due.
  it('gives a title more lines at a larger text size', () => {
    const linesAt = (fontScale: number) => {
      const spy = jest
        // The hook's own module: react-native's index re-exports it by getter.
        .spyOn(require('react-native/Libraries/Utilities/useWindowDimensions'), 'default')
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
      const { unmount } = render(<PredictionCard prediction={prediction} />);
      const lines = screen.getByText(prediction.title).props.numberOfLines;
      unmount();
      spy.mockRestore();
      return lines;
    };
    expect(linesAt(1)).toBe(3);
    expect(linesAt(1.35)).toBe(6);
  });

  // One sentence, not five fragments in layout order, and no "check mark".
  it('reads as one sentence, without the status glyph', () => {
    render(<PredictionCard prediction={prediction} onPress={jest.fn()} />);
    // Resolved cards date themselves by the answer, not the due date, in the
    // same words as on screen, with plain spaces.
    const resolved = relativeDay(new Date(prediction.resolved_at as string)).spoken;
    expect(screen.getByRole('button').props.accessibilityLabel).toBe(
      `I ship the report by Friday. Work, 70% confident, answered ${resolved}. Happened.`,
    );
  });

  // The owner, 2026-11-24: "Due in * days makes the most sense, but for
  // dates further out \u2026 Due Nov 21 (Friday)."
  describe('dates in words', () => {
    // Tuesday 24 November 2026, 10 AM.
    beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 24, 10) }));
    afterEach(() => jest.useRealTimers());
    const open = (due: Date) => ({
      ...prediction,
      status: 'pending' as const,
      resolved_at: null,
      due_date: due.toISOString(),
    });

    it("names an open one's due day from today", () => {
      const { rerender } = render(<PredictionCard prediction={open(new Date(2026, 10, 24, 12))} />);
      expect(screen.getByText('due today')).toBeTruthy();
      rerender(<PredictionCard prediction={open(new Date(2026, 10, 25, 12))} />);
      expect(screen.getByText('due tomorrow')).toBeTruthy();
      rerender(<PredictionCard prediction={open(new Date(2026, 10, 27, 12))} />);
      expect(screen.getByText('due in\u00A03\u00A0days')).toBeTruthy();
      rerender(<PredictionCard prediction={open(new Date(2026, 11, 4, 12))} />);
      expect(screen.getByText('due Dec\u00A04 (Friday)')).toBeTruthy();
      rerender(<PredictionCard prediction={open(new Date(2026, 10, 22, 12))} />);
      expect(screen.getByText('due 2\u00A0days\u00A0ago')).toBeTruthy();
    });

    it("names an answered one's day the same way, and says it the same way", () => {
      const answeredOn = (d: Date) => ({ ...prediction, resolved_at: d.toISOString() });
      const { rerender } = render(
        <PredictionCard prediction={answeredOn(new Date(2026, 10, 23, 19))} onPress={jest.fn()} />,
      );
      expect(screen.getByText('answered yesterday')).toBeTruthy();
      rerender(
        <PredictionCard prediction={answeredOn(new Date(2026, 10, 21, 19))} onPress={jest.fn()} />,
      );
      expect(screen.getByText('answered 3\u00A0days\u00A0ago')).toBeTruthy();
      expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/answered 3 days ago\./);
      rerender(
        <PredictionCard prediction={answeredOn(new Date(2026, 10, 2, 19))} onPress={jest.fn()} />,
      );
      expect(screen.getByText('answered Nov\u00A02 (Monday)')).toBeTruthy();
      expect(screen.getByRole('button').props.accessibilityLabel).toMatch(
        /answered Nov 2 \(Monday\)\./,
      );
    });
  });

  // DESIGN_SYSTEM §7.11: outcomes in words and one neutral ink — no ✓/✗.
  it('names outcomes in words, not glyphs', () => {
    const { rerender } = render(<PredictionCard prediction={prediction} />);
    expect(screen.getByText('Happened')).toBeTruthy();
    rerender(<PredictionCard prediction={{ ...prediction, status: 'resolved_no' }} />);
    expect(screen.getByText("Didn't happen")).toBeTruthy();
    rerender(<PredictionCard prediction={{ ...prediction, status: 'skipped' }} />);
    expect(screen.getByText("Can't tell, not scored")).toBeTruthy();
    expect(screen.queryByText(/[✓✗]/)).toBeNull();
  });

  // Roadmap D41: answered the day it was logged, the outcome stands, unscored.
  it('marks an answer given the day it was logged as not scored', () => {
    const sameDay = {
      ...prediction,
      created_at: new Date(2026, 8, 8, 9).toISOString(),
      resolved_at: new Date(2026, 8, 8, 21).toISOString(),
    };
    const { rerender } = render(<PredictionCard prediction={sameDay} />);
    expect(screen.getByText('Happened, not scored')).toBeTruthy();
    rerender(<PredictionCard prediction={{ ...sameDay, status: 'resolved_no' }} />);
    expect(screen.getByText("Didn't happen, not scored")).toBeTruthy();
  });

  // Coming due is not a lapse: no "Overdue", no warning colour.
  it('calls a past-due prediction ready, not overdue', () => {
    render(
      <PredictionCard
        prediction={{
          ...prediction,
          status: 'pending',
          resolved_at: null,
          due_date: '2020-01-01T12:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByText('Ready to answer')).toBeTruthy();
    expect(screen.queryByText(/overdue/i)).toBeNull();
  });

  // Roadmap step 52: at 320pt the date folded as "Oct / 4" beside the status.
  it('keeps the date in one piece', () => {
    render(<PredictionCard prediction={prediction} />);
    // "work," and "resolved Fri 9 Jan" are sibling Texts, so a long name can
    // give way and the date moves under it (playtest 2026-11-08).
    const meta = screen.getByText(/^answered /);
    const date = String([].concat(meta.props.children).join('')).replace(/^answered /, '');
    // Held together, except before the weekday's bracket: "Jan 9 (Friday)".
    expect(date.replace(' (', '(')).not.toMatch(/ /);
    expect(date).toMatch(/\u00A0/);
  });

  it('is not announced as a button when it does nothing', () => {
    render(<PredictionCard prediction={prediction} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// Roadmap step 31: Resolve asks for a reflection; History reads it back.
describe('PredictionCard — reflections', () => {
  it('shows a saved reflection on a resolved card, and says it to screen readers', () => {
    render(
      <PredictionCard
        prediction={{ ...prediction, reflection: '  Shipped a day late, but it shipped. ' }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId('prediction-card-reflection').props.children).toEqual([
      '“',
      'Shipped a day late, but it shipped.',
      '”',
    ]);
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(
      / Your note: Shipped a day late, but it shipped\.$/,
    );
  });

  // Blind playtest 2026-11-12, finding 20: a long note filled the list row.
  it('clamps the note to three lines in the list', () => {
    render(<PredictionCard prediction={{ ...prediction, reflection: 'A long note. '.repeat(40) }} />);
    expect(screen.getByTestId('prediction-card-reflection').props.numberOfLines).toBe(3);
  });

  it('shows nothing for a blank reflection, or on an open prediction', () => {
    const { rerender } = render(<PredictionCard prediction={{ ...prediction, reflection: '   ' }} />);
    expect(screen.queryByTestId('prediction-card-reflection')).toBeNull();
    rerender(
      <PredictionCard
        prediction={{ ...prediction, status: 'pending', resolved_at: null, reflection: 'draft' }}
      />,
    );
    expect(screen.queryByTestId('prediction-card-reflection')).toBeNull();
  });
});

// Roadmap D33: rows share one grouped surface, and the confidence gets a column.
describe('PredictionCard — as a row in a group', () => {
  it('knows its place in the list', () => {
    expect(rowPosition(0, 1)).toBe('single');
    expect(rowPosition(0, 3)).toBe('first');
    expect(rowPosition(1, 3)).toBe('middle');
    expect(rowPosition(2, 3)).toBe('last');
  });

  it('leaves "Ready to answer" to a header that already says it', () => {
    const due = { ...prediction, status: 'pending' as const, resolved_at: null, due_date: '2020-01-01T12:00:00.000Z' };
    const { rerender } = render(<PredictionCard prediction={due} showReady={false} onPress={jest.fn()} />);
    expect(screen.queryByText('Ready to answer')).toBeNull();
    // Still said to a screen reader, which hears the row alone.
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/Ready to answer.$/);
    rerender(<PredictionCard prediction={due} />);
    expect(screen.getByText('Ready to answer')).toBeTruthy();
  });

  it('draws the stated confidence as a number over a 0–100 scale', () => {
    render(<PredictionCard prediction={prediction} />);
    // Hidden from screen readers, which hear it in the row's own label.
    expect(screen.getByText('70%', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('confidence-scale-p1', { includeHiddenElements: true })).toBeTruthy();
  });
});

// "Hide the words" (D61) was removed on 2026-11-25 (the owner): every card
// shows its words, its note, the category's own name and its chosen icon.
describe('PredictionCard shows everything (2026-11-25)', () => {
  it('shows the words and the note, and says them', () => {
    const noted = { ...prediction, reflection: 'Blood pressure was fine' };
    render(<PredictionCard prediction={noted} onPress={jest.fn()} />);
    expect(screen.getByTestId('prediction-card-title')).toHaveTextContent('I ship the report by Friday');
    expect(screen.getByTestId('prediction-card-reflection')).toHaveTextContent(/Blood pressure was fine/);
    const label = screen.getByRole('button').props.accessibilityLabel as string;
    expect(label.startsWith('I ship the report by Friday. Work, 70% confident')).toBe(true);
    expect(label).toMatch(/Your note: Blood pressure was fine/);
  });

  it('names a category the person named, with the icon they chose', () => {
    useCategoryStore.setState({
      defs: [
        {
          id: 'c-trips',
          user_id: 'u1',
          name: '✈️ Family & travel',
          icon: { kind: 'emoji', emoji: '🏃' },
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    try {
      const view = render(<PredictionCard prediction={{ ...prediction, category: 'c-trips' }} />);
      expect(view.getByTestId('prediction-card-category')).toHaveTextContent('✈️ Family & travel');
      expect(view.getByTestId('category-icon-emoji', { includeHiddenElements: true })).toBeTruthy();
      expect(view.queryByText('Your own category')).toBeNull();
    } finally {
      useCategoryStore.setState({ defs: [] });
    }
  });
});

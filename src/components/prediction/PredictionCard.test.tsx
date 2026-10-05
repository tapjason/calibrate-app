import { render, screen } from '@testing-library/react-native';

import type { Prediction } from '@/types';

import { PredictionCard } from './PredictionCard';

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
  // One sentence, not five fragments in layout order, and no "check mark".
  it('reads as one sentence, without the status glyph', () => {
    render(<PredictionCard prediction={prediction} onPress={jest.fn()} />);
    // Resolved cards date themselves by the answer, not the due date.
    const resolved = new Date(prediction.resolved_at as string).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    expect(screen.getByRole('button').props.accessibilityLabel).toBe(
      `I ship the report by Friday. work, 70% confident, resolved ${resolved}. Happened.`,
    );
  });

  // DESIGN_SYSTEM §7.11: outcomes in words and one neutral ink — no ✓/✗.
  it('names outcomes in words, not glyphs', () => {
    const { rerender } = render(<PredictionCard prediction={prediction} />);
    expect(screen.getByText('Happened')).toBeTruthy();
    rerender(<PredictionCard prediction={{ ...prediction, status: 'resolved_no' }} />);
    expect(screen.getByText("Didn't happen")).toBeTruthy();
    rerender(<PredictionCard prediction={{ ...prediction, status: 'skipped' }} />);
    expect(screen.getByText('Not scored')).toBeTruthy();
    expect(screen.queryByText(/[✓✗]/)).toBeNull();
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
    expect(screen.getByText('Ready to resolve')).toBeTruthy();
    expect(screen.queryByText(/overdue/i)).toBeNull();
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

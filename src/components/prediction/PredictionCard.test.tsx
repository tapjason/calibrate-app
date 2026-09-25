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
    const due = new Date(prediction.due_date).toLocaleDateString();
    expect(screen.getByRole('button').props.accessibilityLabel).toBe(
      `I ship the report by Friday. work, 70% confident, due ${due}. Yes.`,
    );
  });

  it('is not announced as a button when it does nothing', () => {
    render(<PredictionCard prediction={prediction} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

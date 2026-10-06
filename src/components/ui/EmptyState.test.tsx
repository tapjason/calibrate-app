import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

import { EmptyState } from './EmptyState';

// Roadmap step 56: DESIGN_SYSTEM §7.8 asked for a symbol, a sentence and a
// way forward; the symbol never arrived, and the way forward was outlined.
describe('EmptyState', () => {
  it('shows its symbol above the sentence, hidden from screen readers', () => {
    render(
      <EmptyState
        testID="empty"
        symbol={{ sf: 'calendar.badge.plus', fallback: 'calendar-outline' }}
        message="Nothing open."
      />,
    );
    expect(screen.queryByTestId('empty-symbol')).toBeNull();
    expect(screen.getByTestId('empty-symbol', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Nothing open.')).toBeTruthy();
  });

  it('makes its way forward the primary capsule', () => {
    const onAction = jest.fn();
    render(<EmptyState message="Nothing open." actionLabel="Log a prediction" onAction={onAction} />);
    const button = screen.getByRole('button', { name: 'Log a prediction' });
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(colors.brand600);
    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

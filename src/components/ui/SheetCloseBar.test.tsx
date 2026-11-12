import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

import { SheetCloseBar } from './SheetCloseBar';

// Blind playtest 2026-11-12, finding 21: content scrolled up to the floating ×
// with nothing behind it.
describe('SheetCloseBar', () => {
  it('closes from the round ×', () => {
    const onPress = jest.fn();
    render(<SheetCloseBar onPress={onPress} testID="x" />);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sits on an opaque canvas strip, drawn over the content', () => {
    render(<SheetCloseBar onPress={jest.fn()} testID="x" />);
    const bar = StyleSheet.flatten(screen.getByTestId('x-bar').props.style);
    expect(bar.backgroundColor).toBe(colors.canvas);
    expect(bar.zIndex).toBeGreaterThan(0);
  });

  it('shows its hairline only once the content has scrolled', () => {
    const { rerender } = render(<SheetCloseBar onPress={jest.fn()} testID="x" />);
    const rest = StyleSheet.flatten(screen.getByTestId('x-bar').props.style);
    expect(rest.borderBottomColor).not.toBe(colors.hairline);
    rerender(<SheetCloseBar onPress={jest.fn()} testID="x" scrolled />);
    const scrolled = StyleSheet.flatten(screen.getByTestId('x-bar').props.style);
    expect(scrolled.borderBottomColor).toBe(colors.hairline);
    // The same width either way, so nothing moves when it shows.
    expect(scrolled.borderBottomWidth).toBe(rest.borderBottomWidth);
  });
});

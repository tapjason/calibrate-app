import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { colors } from '@/constants/theme';

import { Button } from './Button';

// Reduce Motion is a system setting; mock only that hook. The default export
// (Animated) has to be carried over by hand, since spreading a module object
// drops it.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  };
});

beforeEach(() => jest.mocked(useReducedMotion).mockReturnValue(false));

describe('Button', () => {
  // Without a role, VoiceOver reads a Pressable as plain text and gives no
  // hint that it can be activated.
  it('is announced as a button', () => {
    render(<Button label="Save prediction" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save prediction' })).toBeTruthy();
  });

  it('announces its disabled state', () => {
    render(<Button label="Save" onPress={jest.fn()} disabled testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityState).toEqual({ disabled: true });
  });

  it('speaks the accessibility label instead of a cryptic visible one', () => {
    const onPress = jest.fn();
    render(<Button label="+5" accessibilityLabel="Raise confidence by 5" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Raise confidence by 5' }));
    expect(onPress).toHaveBeenCalled();
  });

  // Roadmap step 81 (HIG Buttons): a destructive action never takes the
  // filled primary look. Outlined, with a red label and edge.
  it('draws a destructive action outlined, not filled', () => {
    render(<Button label="Erase everything" variant="danger" onPress={jest.fn()} testID="d" />);
    const style = StyleSheet.flatten(screen.getByTestId('d').props.style);
    expect(style.backgroundColor).toBe(colors.surface);
    expect(style.borderColor).toBe(colors.destructive);
    expect(StyleSheet.flatten(screen.getByText('Erase everything').props.style).color).toBe(
      colors.destructive,
    );
  });

  // Blind playtest 2026-11-01 (run 4): under Reduce Motion the press dip's
  // own opacity came after the disabled style and drew Save at full strength.
  it.each([false, true])('dims a disabled button (Reduce Motion %s)', (reduced) => {
    jest.mocked(useReducedMotion).mockReturnValue(reduced);
    render(<Button label="Save" onPress={jest.fn()} disabled testID="b" />);
    expect(StyleSheet.flatten(screen.getByTestId('b').props.style).opacity).toBe(0.4);
  });

  it.each([false, true])('draws an enabled button at full strength (Reduce Motion %s)', (reduced) => {
    jest.mocked(useReducedMotion).mockReturnValue(reduced);
    render(<Button label="Save" onPress={jest.fn()} testID="b" />);
    expect(StyleSheet.flatten(screen.getByTestId('b').props.style).opacity).toBe(1);
  });
});

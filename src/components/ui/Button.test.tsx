import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

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
});

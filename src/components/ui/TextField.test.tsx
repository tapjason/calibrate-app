import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from './TextField';

describe('TextField', () => {
  // Blind playtest 2026-11-01: a one-line title scrolled a long prediction
  // out of view while it was typed.
  it('wraps a growing field, with Return as Done', () => {
    render(<TextField label="Prediction" value="" onChangeText={jest.fn()} grows testID="f" />);
    const field = screen.getByTestId('f');
    expect(field.props.multiline).toBe(true);
    expect(field.props.submitBehavior).toBe('blurAndSubmit');
    expect(field.props.returnKeyType).toBe('done');
  });

  it('turns a pasted line break into a space in a growing field', () => {
    const onChangeText = jest.fn();
    render(<TextField label="Prediction" value="" onChangeText={onChangeText} grows testID="f" />);
    fireEvent.changeText(screen.getByTestId('f'), 'I finish the draft\n  by Friday');
    expect(onChangeText).toHaveBeenCalledWith('I finish the draft by Friday');
  });

  it('leaves an ordinary field one line, passing text through as typed', () => {
    const onChangeText = jest.fn();
    render(<TextField label="Email" value="" onChangeText={onChangeText} testID="f" />);
    expect(screen.getByTestId('f').props.multiline).toBeFalsy();
    fireEvent.changeText(screen.getByTestId('f'), 'a\nb');
    expect(onChangeText).toHaveBeenCalledWith('a\nb');
  });

  // Playtest 2026-11-08b, finding 6: a family emoji cut in half at the limit,
  // and a counter that counted UTF-16 units.
  it('cuts at the limit by character, never inside an emoji', () => {
    const onChangeText = jest.fn();
    render(<TextField label="Name" value="" onChangeText={onChangeText} maxLength={18} testID="f" />);
    fireEvent.changeText(screen.getByTestId('f'), 'Friends and famil👩‍👩‍👧‍👦 and more');
    expect(onChangeText).toHaveBeenLastCalledWith('Friends and famil👩‍👩‍👧‍👦');
  });

  it('counts an emoji as one character', () => {
    render(
      <TextField label="Name" value={'a'.repeat(19) + '👩‍👩‍👧‍👦'} onChangeText={jest.fn()} maxLength={20} testID="f" />,
    );
    expect(screen.getByTestId('f-count')).toHaveTextContent(/^20 of 20/);
  });
});

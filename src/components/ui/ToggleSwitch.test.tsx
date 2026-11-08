import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '@/constants/theme';

import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('passes its value and changes through, in the app colours', () => {
    const onValueChange = jest.fn();
    render(<ToggleSwitch value={false} onValueChange={onValueChange} testID="t" />);
    const sw = screen.getByTestId('t');
    expect(sw.props.value).toBe(false);
    expect(sw.props.thumbTintColor ?? sw.props.thumbColor).toBe(colors.onAction);
    fireEvent(sw, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

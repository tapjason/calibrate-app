import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';

import { colors } from '@/constants/theme';

import { MomentChips } from './MomentChips';

/** A chip's style as drawn, at rest or while a finger is on it. */
function chipStyle(testID: string, pressed = false): ViewStyle {
  // The Pressable's style is a function of its pressed state; the host view
  // under it holds the one resolved at rest.
  let node: ReturnType<typeof screen.getByTestId> | null = screen.getByTestId(testID);
  while (node && typeof node.props.style !== 'function') node = node.parent;
  if (!node) throw new Error(`no pressable above ${testID}`);
  return StyleSheet.flatten(node.props.style({ pressed })) as ViewStyle;
}

describe('MomentChips', () => {
  // Step 195: on the practice offer's sunken card controlBorder is 2.93:1 in
  // light, under the 3:1 a control's edge needs.
  it('edges its chips in textTertiary on a sunken card, controlBorder elsewhere', () => {
    const { rerender } = render(<MomentChips selected={null} onChoose={jest.fn()} />);
    expect(chipStyle('moment-chips-coffee').borderColor).toBe(colors.controlBorder);
    rerender(<MomentChips selected={null} onChoose={jest.fn()} onSunken />);
    expect(chipStyle('moment-chips-coffee').borderColor).toBe(colors.textTertiary);
  });

  it('keeps a chosen chip ink-edged on a sunken card', () => {
    render(<MomentChips selected={{ hour: 8, minute: 0 }} onChoose={jest.fn()} onSunken />);
    const chosen = chipStyle('moment-chips-coffee');
    expect(chosen.backgroundColor).toBe(colors.action);
    expect(chosen.borderColor).toBe(colors.action);
  });

  // Step 195: pressing a chosen chip swapped its ink fill for the sunken one
  // under its onAction label, 1.2:1 in both appearances.
  it('keeps an ink fill under a chosen chip while it is pressed', () => {
    render(<MomentChips selected={{ hour: 8, minute: 0 }} onChoose={jest.fn()} withOff />);
    const chosen = chipStyle('moment-chips-coffee', true);
    expect(chosen.backgroundColor).toBe(colors.actionPressed);
    expect(chosen.borderColor).toBe(colors.actionPressed);
    expect(StyleSheet.flatten(screen.getByText('With coffee').props.style).color).toBe(
      colors.onAction,
    );
    // An unchosen chip still sinks under the finger, its label in ink.
    expect(chipStyle('moment-chips-off', true).backgroundColor).toBe(colors.surfaceSunken);
  });
});

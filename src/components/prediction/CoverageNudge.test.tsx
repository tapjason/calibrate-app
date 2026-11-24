import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/constants/theme';

import { CoverageNudge } from './CoverageNudge';

describe('CoverageNudge', () => {
  it('offers the low number and a real "Not now"', () => {
    const onAccept = jest.fn();
    const onDismiss = jest.fn();
    render(<CoverageNudge suggestedConfidence={25} onAccept={onAccept} onDismiss={onDismiss} />);
    fireEvent.press(screen.getByTestId('coverage-nudge-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('coverage-nudge-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // D76 (the voice pass, 2026-11-23): "Everything lately is above 40%. Try
  // one you think probably won't happen."
  it('says the fact, then the ask', () => {
    render(<CoverageNudge suggestedConfidence={25} onAccept={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('coverage-nudge-fact')).toHaveTextContent('Everything lately is above 40%.');
    expect(screen.getByTestId('coverage-nudge-ask')).toHaveTextContent(
      "Try one you think probably won't happen.",
    );
  });

  // Step 195: the card is sunken, where controlBorder is 2.93:1 in light,
  // under the 3:1 a control's edge needs.
  it('outlines its button for the sunken card', () => {
    render(<CoverageNudge suggestedConfidence={25} onAccept={jest.fn()} onDismiss={jest.fn()} />);
    const accept = StyleSheet.flatten(screen.getByTestId('coverage-nudge-accept').props.style);
    expect(accept.borderColor).toBe(colors.textTertiary);
    expect(screen.getByTestId('coverage-nudge-accept')).toHaveTextContent('Start at 25%');
  });
});

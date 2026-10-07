import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { useLocalDay } from './useLocalDay';

function Day() {
  return <Text testID="day">{useLocalDay()}</Text>;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useLocalDay', () => {
  it('turns over at midnight while the app is open', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 59, 0) });
    render(<Day />);
    expect(screen.getByTestId('day')).toHaveTextContent('Tue Oct 06 2026');

    act(() => {
      jest.advanceTimersByTime(61_000);
    });
    expect(screen.getByTestId('day')).toHaveTextContent('Wed Oct 07 2026');

    // And again the night after: the timer re-arms for each new day.
    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(screen.getByTestId('day')).toHaveTextContent('Thu Oct 08 2026');
  });

  it('catches up when the app returns to the foreground on a later day', () => {
    let onChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: string) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 21, 0, 0) });
    render(<Day />);

    // Suspended overnight: no timer ran, the clock moved on.
    jest.setSystemTime(new Date(2026, 9, 7, 8, 0, 0));
    act(() => onChange?.('active'));
    expect(screen.getByTestId('day')).toHaveTextContent('Wed Oct 07 2026');
  });
});

import { act, render, screen } from '@testing-library/react-native';
import { Appearance, Text, type ColorSchemeName } from 'react-native';

import { useAppearance } from './useAppearance';

function Probe({ tick }: { tick: number }) {
  return <Text testID="probe">{`${useAppearance()} ${tick}`}</Text>;
}

describe('useAppearance (roadmap step 91)', () => {
  let scheme: ColorSchemeName = 'light';
  let listeners: Array<() => void> = [];
  let subscribed = 0;

  beforeEach(() => {
    scheme = 'light';
    listeners = [];
    subscribed = 0;
    jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => scheme);
    jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
      subscribed += 1;
      const call = () => listener({ colorScheme: scheme });
      listeners.push(call);
      return {
        remove: () => {
          listeners = listeners.filter((l) => l !== call);
        },
      } as ReturnType<typeof Appearance.addChangeListener>;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('follows a change while mounted', () => {
    render(<Probe tick={0} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light 0');
    scheme = 'dark';
    act(() => listeners.forEach((l) => l()));
    expect(screen.getByTestId('probe')).toHaveTextContent('dark 0');
  });

  // react-native-web's useColorScheme subscribed again on every render, and
  // lost the first switch after a load when a re-render landed mid-event.
  it('subscribes once, however often the screen re-renders', () => {
    const { rerender } = render(<Probe tick={0} />);
    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);
    expect(subscribed).toBe(1);
  });

  it('reads the appearance afresh on a re-render, even with no event', () => {
    const { rerender } = render(<Probe tick={0} />);
    scheme = 'dark';
    rerender(<Probe tick={1} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark 1');
  });

  it('treats anything but dark as light', () => {
    scheme = 'unspecified';
    render(<Probe tick={0} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light 0');
  });
});

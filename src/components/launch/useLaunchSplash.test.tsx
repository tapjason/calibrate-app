import { render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import { holdSplash, SPLASH_MAX_MS, useLaunchSplash } from './useLaunchSplash';

jest.mock('expo-splash-screen', () => ({
  setOptions: jest.fn(),
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => undefined),
}));

function Probe({ done }: { done: boolean }) {
  useLaunchSplash(done);
  return <Text>probe</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

// Roadmap step 59: the splash cut to a white spinner screen on cold start.
describe('launch splash', () => {
  it('holds the splash, with a short fade on the way out', () => {
    holdSplash();
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.setOptions).toHaveBeenCalledWith({ duration: 250, fade: true });
  });

  it('hides once the first screen is decided, not before', () => {
    const { rerender } = render(<Probe done={false} />);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    rerender(<Probe done />);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('never holds longer than the limit', () => {
    render(<Probe done={false} />);
    jest.advanceTimersByTime(SPLASH_MAX_MS - 1);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});

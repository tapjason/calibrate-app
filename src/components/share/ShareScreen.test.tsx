// The Share screen (app/share/index.tsx). It lives here because a test file
// under app/ would be a route to Expo Router.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';

import { colors, elevation } from '@/constants/theme';

import ShareScreen from '../../../app/share/index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => {}) }));
// The panels have their own tests; only the tabs above them are under test.
jest.mock('@/components/share/ShareCardPanel', () => ({ ShareCardPanel: () => null }));
jest.mock('@/components/share/WrappedPanel', () => ({ WrappedPanel: () => null }));

const tabStyle = (key: string) =>
  StyleSheet.flatten(screen.getByTestId(`share-tab-${key}`).props.style) as ViewStyle;

describe('Share screen tabs', () => {
  // Step 195: the chosen tab was surface on the sunken track, 1.19:1 in light
  // and 1.13:1 in dark, told apart by its label's ink alone. It is raised now,
  // as the sign-in switch's chosen segment is.
  it('raises the chosen tab with a textTertiary edge, and draws none on the others', () => {
    render(<ShareScreen />);
    expect(screen.getByTestId('share-tab-card')).toBeSelected();
    expect(tabStyle('card')).toMatchObject({
      backgroundColor: colors.surface,
      borderColor: colors.textTertiary,
      borderWidth: 1,
      shadowOpacity: elevation.e1.shadowOpacity,
    });
    for (const key of ['week', 'year']) {
      expect(tabStyle(key).borderColor).toBe('transparent');
      expect(tabStyle(key).backgroundColor).toBeUndefined();
      expect(tabStyle(key).shadowOpacity).toBeUndefined();
    }

    fireEvent.press(screen.getByTestId('share-tab-week'));
    expect(screen.getByTestId('share-tab-week')).toBeSelected();
    expect(tabStyle('week').borderColor).toBe(colors.textTertiary);
    expect(tabStyle('card').borderColor).toBe('transparent');
  });

  // Every tab keeps the same edge width and padding, chosen or not, so the
  // labels don't move when the choice does.
  it('keeps every tab the same size whichever is chosen', () => {
    render(<ShareScreen />);
    const box = (key: string) => {
      const s = tabStyle(key);
      return [s.borderWidth, s.paddingHorizontal, s.paddingVertical];
    };
    expect(box('card')).toEqual(box('week'));
    expect(box('week')).toEqual(box('year'));
    // The edge's point comes out of the padding: 1 + 3 across and 1 + 7 down,
    // the 4 and 8 the tabs had before they had an edge.
    expect(box('card')).toEqual([1, 3, 7]);
  });
});

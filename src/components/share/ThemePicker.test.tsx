import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DEFAULT_THEME } from '@/constants/cardThemes';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { ThemePicker } from './ThemePicker';

function seed(isPlus: boolean, cardThemeId = DEFAULT_THEME.id) {
  useEntitlementStore.setState({
    entitlement: isPlus
      ? { is_plus: true, source: 'annual', expires_at: null }
      : FREE_ENTITLEMENT,
    isPlus,
    hydrated: true,
  });
  useSettingsStore.setState({ cardThemeId });
}

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
});

afterEach(() => {
  __setPersistenceForTests(null);
});

describe('ThemePicker — free', () => {
  it('lets a free user select the free theme', async () => {
    seed(false, 'midnight');
    render(<ThemePicker />);

    fireEvent.press(screen.getByTestId('theme-midnight'));

    await waitFor(() =>
      expect(useSettingsStore.getState().cardThemeId).toBe('midnight'),
    );
  });

  // Tapping a locked swatch is an offer, not a dead end — and it must never
  // quietly change the theme.
  it('routes a locked theme to the paywall instead of applying it', async () => {
    seed(false);
    const onUpgrade = jest.fn();
    render(<ThemePicker onUpgrade={onUpgrade} />);

    fireEvent.press(screen.getByTestId('theme-forest'));

    expect(onUpgrade).toHaveBeenCalled();
    expect(useSettingsStore.getState().cardThemeId).toBe(DEFAULT_THEME.id);
  });

  it('marks the Plus themes as locked', () => {
    seed(false);
    render(<ThemePicker />);

    expect(screen.getByTestId('theme-lock-forest')).toBeTruthy();
    expect(screen.queryByTestId('theme-lock-midnight')).toBeNull();
  });

  it('says the export is the same either way', () => {
    seed(false);
    render(<ThemePicker />);

    expect(screen.getByText(/exports the same either way/)).toBeTruthy();
  });
});

describe('ThemePicker — Plus', () => {
  it('applies a Plus theme', async () => {
    seed(true);
    render(<ThemePicker />);

    fireEvent.press(screen.getByTestId('theme-ember'));

    await waitFor(() =>
      expect(useSettingsStore.getState().cardThemeId).toBe('ember'),
    );
  });

  it('shows no locks', () => {
    seed(true);
    render(<ThemePicker />);

    expect(screen.queryByTestId('theme-lock-forest')).toBeNull();
  });

  // The stored id survives a lapse; only what renders changes.
  it('shows the free theme as active when a Plus theme is held without Plus', () => {
    seed(false, 'ember');
    render(<ThemePicker />);

    expect(screen.getByTestId('theme-midnight').props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(useSettingsStore.getState().cardThemeId).toBe('ember');
  });
});

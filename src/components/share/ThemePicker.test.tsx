import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DEFAULT_THEME } from '@/constants/cardThemes';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
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

// The under-13 rule (roadmap D70): Share keeps its free theme, with no lock
// and nothing that opens the paywall.
describe('ThemePicker — under the under-13 rule', () => {
  afterEach(() => act(() => __resetAgeStoreForTests()));

  // The free theme is the only one this phone can use, so there is nothing
  // to choose: no picker, no lock, no word about Plus.
  it('draws no picker without a Plus mirror', () => {
    seed(false, 'forest');
    useAgeStore.setState({ localOnly: true });
    const onUpgrade = jest.fn();
    render(<ThemePicker onUpgrade={onUpgrade} />);

    expect(screen.queryByTestId('theme-picker')).toBeNull();
    expect(screen.queryByTestId('theme-forest')).toBeNull();
    expect(screen.queryByTestId('theme-lock-forest')).toBeNull();
    expect(screen.queryByText(/Plus/)).toBeNull();
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  // Nothing is offered; a Plus mirror already on the phone keeps its themes.
  it('keeps every theme, unlocked, for a Plus mirror, and applies one', async () => {
    seed(true);
    useAgeStore.setState({ localOnly: true });
    const onUpgrade = jest.fn();
    render(<ThemePicker onUpgrade={onUpgrade} />);
    expect(screen.getByTestId(`theme-${DEFAULT_THEME.id}`)).toBeTruthy();
    expect(screen.getByTestId('theme-forest')).toBeTruthy();
    expect(screen.queryByTestId('theme-lock-forest')).toBeNull();
    expect(screen.queryByText(/come with Plus/)).toBeNull();

    fireEvent.press(screen.getByTestId('theme-forest'));
    await waitFor(() => expect(useSettingsStore.getState().cardThemeId).toBe('forest'));
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('is the usual picker, locks and all, without the rule', () => {
    seed(false);
    useAgeStore.setState({ localOnly: false });
    render(<ThemePicker onUpgrade={jest.fn()} />);
    expect(screen.getByTestId('theme-lock-forest')).toBeTruthy();
  });
});

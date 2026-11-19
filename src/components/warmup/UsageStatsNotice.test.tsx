import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, type } from '@/constants/theme';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import {
  __setPersistenceForTests,
  useSettingsStore,
  type StoredSettings,
} from '@/store/settingsStore';
import { useWarmupStore } from '@/store/warmupStore';

import { usageCountsMayGoUp } from './usageNotice';
import { UsageStatsNotice, WARMUP_USAGE_NOTE } from './UsageStatsNotice';

// D69 (b): a line and a switch for usage counts on the Warm-up's first
// screen, before anything is sent (guideline 5.1.1(ii)).

/** Every settings record written, in order. */
let saved: StoredSettings[];

beforeEach(async () => {
  setDbForTests(await createTestDb());
  saved = [];
  // Also puts every setting back to a fresh install's: never shown.
  __setPersistenceForTests({
    load: async () => null,
    save: async (s) => {
      saved.push(s);
    },
  });
  __resetLockStoreForTests();
  useSettingsStore.setState({ analyticsEnabled: true });
  useAuthStore.setState({ status: 'guest', userId: 'local-user-v1' });
  useWarmupStore.setState({ index: 0, answers: [], result: null, completedAt: null, pick: null });
});

afterEach(() => {
  __setPersistenceForTests(null);
  __resetLockStoreForTests();
  setDbForTests(null);
});

describe('UsageStatsNotice', () => {
  // Policy re-audit L1 (2026-11-19): the line says what the counts are for.
  it('says what goes up and why, word for word, in the secondary style', () => {
    expect(WARMUP_USAGE_NOTE).toBe(
      'Fairly Sure sends a few usage counts, with no account or device id, to see how the app is used. You can turn this off here or in You.',
    );
    render(<UsageStatsNotice />);
    const line = screen.getByTestId('warmup-usage-note');
    expect(line).toHaveTextContent(WARMUP_USAGE_NOTE);
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({
      fontSize: type.footnote.fontSize,
      color: colors.textSecondary,
    });
  });

  // One switch element for VoiceOver, named as in You (roadmap step 41).
  it('is one switch named Usage stats, with the line as its hint', () => {
    render(<UsageStatsNotice />);
    const row = screen.getByTestId('warmup-usage-row');
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityLabel).toBe('Usage stats');
    expect(row.props.accessibilityHint).toBe(WARMUP_USAGE_NOTE);
    expect(row.props.accessibilityState).toMatchObject({ checked: true });
    // The inner switch is hidden from assistive tech.
    expect(screen.queryByTestId('warmup-usage-switch')).toBeNull();
    expect(screen.getByTestId('warmup-usage-switch', { includeHiddenElements: true })).toBeTruthy();
  });

  it('turns usage stats off and on in the same setting as You', async () => {
    render(<UsageStatsNotice />);
    fireEvent.press(screen.getByTestId('warmup-usage-row'));
    await waitFor(() => expect(useSettingsStore.getState().analyticsEnabled).toBe(false));
    expect(screen.getByTestId('warmup-usage-row').props.accessibilityState).toMatchObject({
      checked: false,
    });

    fireEvent.press(screen.getByTestId('warmup-usage-row'));
    await waitFor(() => expect(useSettingsStore.getState().analyticsEnabled).toBe(true));
  });

  it('shows the switch off when usage stats are off', () => {
    useSettingsStore.setState({ analyticsEnabled: false });
    render(<UsageStatsNotice />);
    expect(screen.getByTestId('warmup-usage-row').props.accessibilityState).toMatchObject({
      checked: false,
    });
    const inner = screen.getByTestId('warmup-usage-switch', { includeHiddenElements: true });
    expect(inner.props.value).toBe(false);
  });

  // Nothing goes up from a guest before this has been seen.
  it('lets a guest’s counts go up once it has been drawn', () => {
    expect(usageCountsMayGoUp()).toBe(false);
    render(<UsageStatsNotice />);
    expect(usageCountsMayGoUp()).toBe(true);
  });

  it('stamps when it was first shown and saves it, once: a later showing keeps the first', async () => {
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    const before = Date.now();
    const first = render(<UsageStatsNotice />);
    await waitFor(() => expect(saved).toHaveLength(1));
    const stamp = useSettingsStore.getState().usageNoticeShownAt;
    expect(stamp).not.toBeNull();
    expect(Date.parse(stamp!)).toBeGreaterThanOrEqual(before);
    expect(saved[0].usageNoticeShownAt).toBe(stamp);

    // Drawn again (the Warm-up reopened, a relaunch): nothing changes, nothing is written.
    first.unmount();
    render(<UsageStatsNotice />);
    await act(async () => {});
    expect(useSettingsStore.getState().usageNoticeShownAt).toBe(stamp);
    expect(saved).toHaveLength(1);
  });

  // D64: drawn under the lock screen (the lock armed before the first screen),
  // it hasn't been seen yet.
  it('waits for the unlock when the app lock covers it', async () => {
    useLockStore.setState({ locked: true });
    render(<UsageStatsNotice />);
    await act(async () => {});
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(usageCountsMayGoUp()).toBe(false);
    expect(saved).toHaveLength(0);

    act(() => useLockStore.setState({ locked: false }));
    await waitFor(() => expect(useSettingsStore.getState().usageNoticeShownAt).not.toBeNull());
    expect(usageCountsMayGoUp()).toBe(true);
    await waitFor(() => expect(saved).toHaveLength(1));
  });
});

// The under-13 rule (roadmap D70): no count is ever sent from a local-only
// phone, so the line isn't drawn and nothing is stamped; before Apple has
// answered on a launch that asks, it is drawn and the stamp waits.
describe('UsageStatsNotice under the under-13 rule', () => {
  afterEach(() => act(() => __resetAgeStoreForTests()));

  it('is not drawn and stamps nothing on a local-only phone', async () => {
    useAgeStore.setState({ localOnly: true, settled: true });
    render(<UsageStatsNotice />);
    await act(async () => {});
    expect(screen.queryByTestId('warmup-usage-row')).toBeNull();
    expect(screen.queryByTestId('warmup-usage-note')).toBeNull();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('is drawn but waits for Apple’s answer before it stamps', async () => {
    useAgeStore.setState({ localOnly: false, settled: false });
    render(<UsageStatsNotice />);
    await act(async () => {});
    expect(screen.getByTestId('warmup-usage-note')).toHaveTextContent(WARMUP_USAGE_NOTE);
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(saved).toHaveLength(0);

    act(() => useAgeStore.getState().markSettled());
    await waitFor(() => expect(useSettingsStore.getState().usageNoticeShownAt).not.toBeNull());
    await waitFor(() => expect(saved).toHaveLength(1));
  });

  it('goes, unstamped, when the answer turns the rule on', async () => {
    useAgeStore.setState({ localOnly: false, settled: false });
    render(<UsageStatsNotice />);
    await act(async () => {});
    expect(screen.getByTestId('warmup-usage-row')).toBeTruthy();

    act(() => useAgeStore.setState({ localOnly: true, settled: true }));
    await act(async () => {});
    expect(screen.queryByTestId('warmup-usage-row')).toBeNull();
    expect(useSettingsStore.getState().usageNoticeShownAt).toBeNull();
    expect(saved).toHaveLength(0);
  });
});

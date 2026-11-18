// Step 194 (D67; FUTURE_UI B1): a streak checkpoint's moment, on Resolve's
// card and on Today's streak row.
import { act, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { StreakCheckpointCard } from '@/components/resolution/StreakCheckpointCard';
import { localDayKey } from '@/components/ui/useLocalDay';
import { SPRING_LANDS_MS } from '@/components/ui/useSpringIn';
import {
  __setPersistenceForTests,
  useSettingsStore,
  type SettingsPersistence,
  type StoredSettings,
} from '@/store/settingsStore';
import type { StreakStatus } from '@/types';

import { claimStreakMoment, isMajorCheckpoint } from './checkpointMoment';
import { StreakLine } from './StreakLine';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Reduce Motion is a system setting; mock only that hook (the default export
// has to be carried over by hand, as MilestoneCard's test does).
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  };
});

const impact = jest.mocked(Haptics.impactAsync);
const notification = jest.mocked(Haptics.notificationAsync);

/** An in-memory store for the settings, so a relaunch can read back what was saved. */
function memory(initial: Partial<StoredSettings> | null = null) {
  let stored = initial;
  const persistence: SettingsPersistence = {
    load: async () => stored,
    save: async (s) => {
      stored = s;
    },
  };
  return { persistence, stored: () => stored };
}

/** Confetti, emblems and icons are decorative (hidden from screen readers). */
const HIDDEN = { includeHiddenElements: true } as const;

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  impact.mockClear();
  notification.mockClear();
  __setPersistenceForTests(memory().persistence);
});

afterEach(() => {
  jest.useRealTimers();
  __setPersistenceForTests(null);
});

describe('isMajorCheckpoint', () => {
  it('is 100, 365 and each further year, never 7 or 30', () => {
    expect([7, 30, 100, 365, 730, 1095].map(isMajorCheckpoint)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('claimStreakMoment: once a local day', () => {
  const noon = new Date(2026, 10, 18, 12);
  const nextMorning = new Date(2026, 10, 19, 8);

  it('lets the first one play and marks the day; the same day again stays still', () => {
    expect(claimStreakMoment(noon)).toBe(true);
    expect(useSettingsStore.getState().streakMomentDay).toBe(localDayKey(noon));
    expect(claimStreakMoment(new Date(2026, 10, 18, 23, 59))).toBe(false);
    // A new streak can reach 7 again later: the day is the key, not the number.
    expect(claimStreakMoment(nextMorning)).toBe(true);
  });

  it('remembers it across a relaunch the same day', async () => {
    const before = memory();
    __setPersistenceForTests(before.persistence);
    expect(claimStreakMoment(noon)).toBe(true);
    await Promise.resolve();

    // A relaunch: a fresh store, hydrated from what was saved.
    __setPersistenceForTests(memory(before.stored()).persistence);
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
    await useSettingsStore.getState().hydrate();
    expect(claimStreakMoment(new Date(2026, 10, 18, 18))).toBe(false);
  });

  it('never plays while the streak is hidden in You, and marks nothing', () => {
    useSettingsStore.setState({ streakShown: false });
    expect(claimStreakMoment(noon)).toBe(false);
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });
});

describe('StreakCheckpointCard, celebrating (Resolve)', () => {
  const lands = () =>
    act(() => {
      jest.advanceTimersByTime(SPRING_LANDS_MS);
    });

  it('at 7: the Rigid tap once as it lands, the count rolling up from 6, no confetti', () => {
    render(<StreakCheckpointCard days={7} next={30} celebrate />);
    expect(screen.getByTestId('streak-checkpoint-count', HIDDEN).props.children).toBe('6');
    act(() => {
      jest.advanceTimersByTime(SPRING_LANDS_MS - 1);
    });
    expect(impact).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid);
    expect(notification).not.toHaveBeenCalled();
    expect(screen.queryByTestId('streak-checkpoint-confetti', HIDDEN)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('streak-checkpoint-count', HIDDEN).props.children).toBe('7');
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('at 30: the Rigid tap, no confetti', () => {
    render(<StreakCheckpointCard days={30} next={100} celebrate />);
    lands();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid);
    expect(notification).not.toHaveBeenCalled();
    expect(screen.queryByTestId('streak-checkpoint-confetti', HIDDEN)).toBeNull();
  });

  it.each([100, 365, 730])('at %i: Success, and confetti from the flame', (days) => {
    render(<StreakCheckpointCard days={days} next={days === 100 ? 365 : days + 365} celebrate />);
    expect(screen.getByTestId('streak-checkpoint-confetti', HIDDEN)).toBeTruthy();
    lands();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(impact).not.toHaveBeenCalled();
  });

  it('under Reduce Motion: the haptic at once, the count as it is, no confetti', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(<StreakCheckpointCard days={100} next={365} celebrate />);
    expect(screen.getByTestId('streak-checkpoint-count', HIDDEN).props.children).toBe('100');
    expect(screen.queryByTestId('streak-checkpoint-confetti', HIDDEN)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(notification).toHaveBeenCalledTimes(1);
  });

  it('still, without celebrate: no haptic, no count-up, no confetti', () => {
    render(<StreakCheckpointCard days={100} next={365} />);
    expect(screen.getByTestId('streak-checkpoint-count', HIDDEN).props.children).toBe('100');
    expect(screen.queryByTestId('streak-checkpoint-confetti', HIDDEN)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(impact).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it('plays once, however often the card renders again', () => {
    const view = render(<StreakCheckpointCard days={7} next={30} celebrate />);
    lands();
    view.rerender(<StreakCheckpointCard days={7} next={30} celebrate />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(impact).toHaveBeenCalledTimes(1);
  });
});

describe('the streak row, celebrating (Today, after a log)', () => {
  const day = (streak: number, next: number): StreakStatus => ({
    streak,
    today: 1,
    todayCounts: true,
    checkpoint: streak,
    nextCheckpoint: next,
    restDays: 0,
    restUsed: 0,
    restEarnedToday: false,
    nextRestAt: null,
  });

  it('waits out of sight, then plays: the count from the day before and the haptic as it lands', () => {
    const opacity = () => getAnimatedStyle(screen.getByTestId('streak-line-moment')).opacity;
    // Shown as it is until Today hands it a moment.
    const view = render(<StreakLine status={day(7, 30)} />);
    expect(opacity()).toBe(1);
    view.rerender(<StreakLine status={day(7, 30)} moment={{ days: 7, play: false }} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(opacity()).toBe(0);
    expect(impact).not.toHaveBeenCalled();

    view.rerender(<StreakLine status={day(7, 30)} moment={{ days: 7, play: true }} />);
    expect(screen.getByTestId('streak-line-count', HIDDEN).props.children).toBe('6');
    act(() => {
      jest.advanceTimersByTime(SPRING_LANDS_MS);
    });
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid);
    expect(screen.queryByTestId('streak-line-confetti', HIDDEN)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('streak-line-count', HIDDEN).props.children).toBe('7');
    // In sight again, on the spring.
    expect(opacity()).toBeGreaterThan(0.9);
    // The words keep the full count throughout.
    expect(screen.getByTestId('streak-line').props.accessibilityLabel).toMatch(/^7-day streak\. A full week\./);
  });

  it('at 100: Success and confetti from the row', () => {
    render(<StreakLine status={day(100, 365)} moment={{ days: 100, play: true }} />);
    expect(screen.getByTestId('streak-line-confetti', HIDDEN)).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(SPRING_LANDS_MS);
    });
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('under Reduce Motion: no count-up and no confetti, the haptic still fires', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(<StreakLine status={day(365, 730)} moment={{ days: 365, play: true }} />);
    expect(screen.getByTestId('streak-line-count', HIDDEN).props.children).toBe('365');
    expect(screen.queryByTestId('streak-line-confetti', HIDDEN)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(notification).toHaveBeenCalledTimes(1);
  });

  it('plays nothing while the streak is hidden in You', () => {
    useSettingsStore.setState({ streakShown: false });
    render(<StreakLine status={day(100, 365)} moment={{ days: 100, play: true }} />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('streak-line')).toBeNull();
    expect(notification).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it('plays nothing on a day that is no checkpoint', () => {
    render(
      <StreakLine
        status={{ ...day(8, 30), checkpoint: null }}
        moment={{ days: 8, play: true }}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(impact).not.toHaveBeenCalled();
    expect(screen.getByTestId('streak-line-count', HIDDEN).props.children).toBe('8');
  });
});

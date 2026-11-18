// A streak checkpoint's moment (step 194, D67; FUTURE_UI B1): the fourth full
// moment after the Warmup verdict, the score unlock and a badge tier-up
// (DESIGN_SYSTEM §6.2). Played by StreakCheckpointCard on the answer that
// reached a checkpoint, and by the streak row on Today after a log did.
//
// What it is: the card or row scales in on the milestone spring; the count
// rolls up from the day before (6 → 7); the flame bounces once, 1.0 → 1.15 →
// 1.0, drawn with Reanimated on every platform rather than an SF Symbols
// effect; and as it lands, one haptic: the Rigid tap at 7 and 30, Success
// from 100. Confetti leaves the flame at 100, 365 and each further year only,
// so a burst keeps meaning something. Reduce Motion: a 200 ms cross-fade and
// the haptic, with no count-up, bounce or confetti.
//
// Never: while "Streak and daily goal" is off in You, more than once a local
// day, or when a streak ends.

import { useEffect, useRef } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/components/ui/haptics';
import { localDayKey } from '@/components/ui/useLocalDay';
import { SPRING_LANDS_MS, useSpringIn, type Entrance } from '@/components/ui/useSpringIn';
import { useSettingsStore } from '@/store/settingsStore';

/** A checkpoint to celebrate, as Today hands it to the streak row. */
export interface CheckpointMoment {
  /** The checkpoint reached: 7, 30, 100, 365, then each further year. */
  days: number;
  /** False while Today brings the row into view, which keeps it out of sight; true plays it. */
  play: boolean;
}

/** 100, 365 and each further year: confetti and the Success haptic. 7 and 30 have neither. */
export function isMajorCheckpoint(days: number): boolean {
  return days >= 100;
}

/**
 * Whether a checkpoint's moment may play now, and if so marks today as the
 * day it played (`streakMomentDay`). Never while the streak is hidden in You,
 * and once a local day: a checkpoint is reached at most once a day, so a
 * relaunch or a second route to the same one (a log deleted and logged
 * again) shows it still. Call it once, where the moment is decided, not
 * while rendering.
 */
export function claimStreakMoment(now: Date = new Date()): boolean {
  const settings = useSettingsStore.getState();
  if (!settings.streakShown) return false;
  const day = localDayKey(now);
  if (settings.streakMomentDay === day) return false;
  void settings.setStreakMomentDay(day);
  return true;
}

/** The flame's bounce: up to 1.15 and back, once, each half this long. */
const FLAME_PEAK = 1.15;
const FLAME_HALF_MS = 150;

/**
 * The moment's motion and haptic for a card or row showing `days`. `still`
 * shows it as it is; `waiting` keeps it out of sight; `play` runs it, once
 * for the life of the component. Returns the styles for the whole (an
 * `Animated.View`) and for the flame, whether it's playing (the count rolls
 * up then, through `CountUp` from `days - 1`), and whether to burst confetti.
 */
export function useCheckpointMoment(days: number, entrance: Entrance) {
  const reduceMotion = useReducedMotion();
  const whole = useSpringIn(entrance);
  const flameScale = useSharedValue(1);
  const played = useRef(false);
  const playing = entrance === 'play';

  useEffect(() => {
    if (!playing || played.current) return;
    // As it lands: when the spring first reaches full size, or at once with
    // Reduce Motion, where the haptic still fires (§6.1 `reduced`).
    const lands = reduceMotion ? 0 : SPRING_LANDS_MS;
    if (!reduceMotion) {
      const half = { duration: FLAME_HALF_MS, easing: Easing.out(Easing.quad) };
      flameScale.value = withDelay(
        lands,
        withSequence(withTiming(FLAME_PEAK, half), withTiming(1, half)),
      );
    }
    const timer = setTimeout(() => {
      played.current = true;
      haptics.checkpoint(isMajorCheckpoint(days));
    }, lands);
    return () => clearTimeout(timer);
  }, [playing, days, reduceMotion, flameScale]);

  const flame = useAnimatedStyle(() => ({ transform: [{ scale: flameScale.value }] }));

  return {
    whole,
    flame,
    playing,
    confetti: playing && !reduceMotion && isMajorCheckpoint(days),
  };
}

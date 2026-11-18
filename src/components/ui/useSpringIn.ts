import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** DESIGN_SYSTEM §6.1 `unlock`: the milestone card's spring. */
export const MILESTONE_SPRING = { damping: 14, stiffness: 180 } as const;

/** §6.1 `reduced`: every celebration becomes a 200 ms cross-fade. */
export const REDUCED_FADE_MS = 200;

/**
 * When the milestone spring first reaches full size, which is when a moment
 * "lands": about 0.18 s at damping 14 and stiffness 180 (mass 1, so the
 * damping ratio is 0.52). Not measured on a phone.
 */
export const SPRING_LANDS_MS = 180;

/**
 * Where an entrance stands: `still` is shown as it is, with no motion;
 * `waiting` is held out of sight until it plays (Today keeps the streak row
 * hidden while it brings it into view, step 194); `play` scales it in.
 */
export type Entrance = 'still' | 'waiting' | 'play';

/**
 * The milestone card's entrance (DESIGN_SYSTEM §6.1 `unlock`), shared by
 * every full moment so none forks it: it scales in from 90% on the milestone
 * spring as it fades in. Under Reduce Motion, a 200 ms fade and no scale.
 * Returns the animated style for an `Animated.View`.
 */
export function useSpringIn(entrance: Entrance = 'play') {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(entrance === 'still' ? 1 : 0);

  useEffect(() => {
    if (entrance === 'still') {
      shown.value = 1;
      return;
    }
    if (entrance === 'waiting') {
      shown.value = 0;
      return;
    }
    shown.value = reduceMotion
      ? withTiming(1, { duration: REDUCED_FADE_MS })
      : withSpring(1, MILESTONE_SPRING);
  }, [entrance, reduceMotion, shown]);

  return useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: reduceMotion ? [] : [{ scale: 0.9 + 0.1 * shown.value }],
  }));
}

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { InFront, LaunchPage } from '@/components/launch/LaunchPage';
import { SPLASH_MAX_MS } from '@/components/launch/useLaunchSplash';
import { useLockStore } from '@/store/lockStore';

/** The name fades in this long after the native splash starts to go. */
export const LAUNCH_NAME_DELAY_MS = 150;
export const LAUNCH_NAME_IN_MS = 350;
/** How long the page stays once the app is ready behind it. */
export const LAUNCH_HOLD_MS = 1100;
export const LAUNCH_OUT_MS = 300;

interface LaunchScreenProps {
  /** The app is ready and the first screen is decided: the native splash is going. */
  started: boolean;
}

/**
 * The launch page, held for a moment over the first screen (step 187). The
 * native splash fades to it and nothing moves: the mark is where the splash
 * drew it. Then the name comes in, the page holds about a second, and it
 * fades to the screen the person will use. It used to cut from the splash
 * straight to the Warm-up's first question (the owner, on the first
 * TestFlight build).
 *
 * Once per cold start, never on a return from the background. With the app
 * lock up it stands aside: the lock screen is the same page, and after the
 * unlock the app is simply there. Under Reduce Motion nothing fades: the name
 * is there from the start and the page is cut.
 *
 * The timers decide when it goes; the animations only decorate, so a dropped
 * animation callback can't leave the page up. Nor can a launch that never says
 * it's ready: after `SPLASH_MAX_MS` the page goes as if it had.
 */
export function LaunchScreen({ started }: LaunchScreenProps) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'up' | 'leaving' | 'gone'>('up');
  const name = useRef(new Animated.Value(0)).current;
  const page = useRef(new Animated.Value(1)).current;
  // The most it waits for the app to say it's ready: the native splash's own
  // limit. A routing step that hung or threw left the page up, over the app
  // and taking its taps, for good (security review, 2026-11-18). The app
  // lock is its own screen (AppLockGate) and has no time limit of any kind.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const limit = setTimeout(() => setTimedOut(true), SPLASH_MAX_MS);
    return () => clearTimeout(limit);
  }, []);
  // Once true it stays true, so a late "ready" doesn't start the hold again.
  const go = started || timedOut;

  useEffect(() => {
    if (!go) return undefined;
    if (useLockStore.getState().locked) {
      setPhase('gone');
      return undefined;
    }
    if (reduceMotion) {
      name.setValue(1);
      const cut = setTimeout(() => setPhase('gone'), LAUNCH_HOLD_MS);
      return () => clearTimeout(cut);
    }
    Animated.timing(name, {
      toValue: 1,
      delay: LAUNCH_NAME_DELAY_MS,
      duration: LAUNCH_NAME_IN_MS,
      useNativeDriver: true,
    }).start();
    const leave = setTimeout(() => {
      setPhase('leaving');
      Animated.timing(page, {
        toValue: 0,
        duration: LAUNCH_OUT_MS,
        useNativeDriver: true,
      }).start();
    }, LAUNCH_HOLD_MS);
    const done = setTimeout(() => setPhase('gone'), LAUNCH_HOLD_MS + LAUNCH_OUT_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [go, reduceMotion, name, page]);

  if (phase === 'gone') return null;

  return (
    <InFront>
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: page }]}
        // Taps reach the screen underneath as soon as it starts to show.
        pointerEvents={phase === 'leaving' ? 'none' : 'auto'}
        // Decoration: VoiceOver starts on the screen underneath.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="launch-screen"
      >
        <LaunchPage nameOpacity={name} />
      </Animated.View>
    </InFront>
  );
}

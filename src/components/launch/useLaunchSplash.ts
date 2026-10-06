import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

/**
 * Longest the splash may hold, whatever happens: a launch that never reports
 * ready must still end on something the person can see and act on.
 */
export const SPLASH_MAX_MS = 4000;

/**
 * Keep the native splash up until the first real screen is decided
 * (roadmap step 59). It used to hide on the first React frame, which was the
 * root layout's loading view: on a cold start the indigo splash cut to a white
 * screen with a spinner, and on a first run to Home for a moment before the
 * Warmup replaced it.
 *
 * Call `holdSplash()` once at module scope (Expo's advice: from a component it
 * can run after the splash is already gone), then this hook with `done` once
 * the gate is open and any first-run redirect has been made. Web has no native
 * splash; every call there is a no-op.
 */
export function holdSplash(): void {
  SplashScreen.setOptions({ duration: 250, fade: true });
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

export function useLaunchSplash(done: boolean): void {
  useEffect(() => {
    if (done) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, [done]);
}

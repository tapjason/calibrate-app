import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** One key per local calendar day ("Tue Oct 06 2026"). */
export function localDayKey(at: Date): string {
  return at.toDateString();
}

/**
 * The local calendar day, as a key that changes at midnight while the app is
 * open and when the app comes back to the foreground on a later day.
 *
 * Screens that read the clock at render ("Ready to resolve", the streak row,
 * "due Tue, Oct 13") only re-rendered on a store change, and a tab stays
 * mounted, so Home could still say "Today counts" the next morning. Calling
 * this re-renders them when the day turns; setting the same key again is a
 * no-op, so it costs nothing on an ordinary return to the app.
 */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => localDayKey(new Date()));

  useEffect(() => {
    const check = () => setDay(localDayKey(new Date()));
    const now = new Date();
    // A second past midnight, so the check can't land a hair before it.
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(check, next.getTime() - now.getTime());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [day]);

  return day;
}

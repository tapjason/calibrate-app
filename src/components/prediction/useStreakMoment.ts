import { useCallback, useRef, useState, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, SectionList, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { claimStreakMoment, type CheckpointMoment } from '@/components/stats/checkpointMoment';
import { space } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';

import { scrollToShow } from './locateCard';

/**
 * The streak row's checkpoint moment on Today (step 194): how long an
 * animated scroll takes to bring the row in before it plays (UIScrollView's
 * is about 0.3 s), how long a measurement may take before it plays where the
 * row is, and how long it runs before the row is still again (confetti's
 * 1.2 s and its start).
 */
const STREAK_SCROLL_MS = 400;
const MEASURE_GUARD_MS = 300;
const MOMENT_MS = 1800;

/**
 * Today's half of a streak checkpoint a log reached (step 194, D67; FUTURE_UI
 * B1). Log closes onto Today, so the streak row plays the checkpoint's
 * moment there, brought into view first so the haptic has its visual twin
 * (rule 0.8). Until then the row is held out of sight (`play` false), so its
 * count doesn't show and then roll back; once it has played it's still
 * again, so a re-render or the row moving can't run it twice.
 *
 * Today attaches `screenBox` to the view around its list, `streakBox` to the
 * view around the streak row and `trackScroll` to the list's scroll events,
 * passes `moment` to the row, and calls `claimLogged` and `hold` on focus,
 * `bringIntoView` once the list has settled, and `stop` on blur.
 */
export function useStreakMoment<T>(listRef: RefObject<SectionList<T> | null>) {
  const reduceMotion = useReducedMotion();
  // Read when the scroll happens, so the callbacks below can stay stable.
  const reduced = useRef(reduceMotion);
  reduced.current = reduceMotion;
  const [moment, setMoment] = useState<CheckpointMoment | null>(null);
  const screenBox = useRef<View>(null);
  const streakBox = useRef<View>(null);
  // Where the list is scrolled, for a scroll by a measured distance.
  const scrollY = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped by `stop`, so a measurement answered late does nothing.
  const run = useRef(0);

  const trackScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  /**
   * The checkpoint a log reached, taken from the store, if its moment may
   * play now; null otherwise. An answer's is left for Resolve. A log's is
   * taken either way: while the streak is hidden in You, or once its moment
   * has played today, nothing plays (`claimStreakMoment`).
   */
  const claimLogged = useCallback((): number | null => {
    const store = usePredictionStore.getState();
    const logged = store.streakCheckpointFrom === 'log' ? store.streakCheckpoint : null;
    if (logged === null) return null;
    store.clearStreakCheckpoint();
    return claimStreakMoment() ? logged : null;
  }, []);

  /** Holds the row out of sight until `bringIntoView` plays it. */
  const hold = useCallback((days: number) => setMoment({ days, play: false }), []);

  const bringIntoView = useCallback(() => {
    const current = run.current;
    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };
    const play = (after: number) => {
      const start = () => setMoment((m) => (m ? { ...m, play: true } : m));
      if (after > 0) later(start, after);
      else start();
      later(() => setMoment(null), after + MOMENT_MS);
    };
    const row = streakBox.current;
    const box = screenBox.current;
    if (!row || !box) {
      play(0);
      return;
    }
    // A measurement that never answers (a view gone, a test renderer) still
    // lets the moment play, where the row is.
    let measured = false;
    later(() => {
      if (measured || current !== run.current) return;
      measured = true;
      play(0);
    }, MEASURE_GUARD_MS);
    row.measureInWindow((_x, rowTop, _w, rowHeight) => {
      box.measureInWindow((_bx, boxTop, _bw, boxHeight) => {
        if (measured || current !== run.current) return;
        measured = true;
        const by = scrollToShow({
          top: rowTop - boxTop,
          height: rowHeight,
          viewHeight: boxHeight,
          margin: space.lg,
        });
        if (by === 0) {
          play(0);
          return;
        }
        listRef.current
          ?.getScrollResponder()
          ?.scrollTo({ y: Math.max(0, scrollY.current + by), animated: !reduced.current });
        // After the scroll has brought it in; at once without animation.
        play(reduced.current ? 0 : STREAK_SCROLL_MS);
      });
    });
  }, [listRef]);

  /** Today lost focus: nothing more plays, and the row is shown as it is. */
  const stop = useCallback(() => {
    run.current += 1;
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setMoment(null);
  }, []);

  return {
    moment,
    screenBox,
    streakBox,
    trackScroll,
    claimLogged,
    hold,
    bringIntoView,
    stop,
  };
}

import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { space } from '@/constants/theme';

/**
 * How long after a reveal a layout change (a pinned bar growing a line, a
 * footer moving into the scroll) checks again, so the block isn't left half
 * under a bar that grew just after the scroll.
 */
export const REVEAL_SETTLE_MS = 600;

/**
 * Where to scroll so a block's bottom shows, with `margin` under it, no
 * further than needed; null when its bottom already shows (or nothing is laid
 * out). Never past its top: a block taller than the view shows from the top.
 * Only ever down: the block is below what shows, or it's left as it is.
 */
export function revealScrollY({
  top,
  bottom,
  scrollY,
  viewport,
  margin,
}: {
  top: number;
  bottom: number;
  scrollY: number;
  viewport: number;
  margin: number;
}): number | null {
  if (viewport <= 0 || bottom <= top) return null;
  if (bottom <= scrollY + viewport) return null;
  const y = Math.max(0, Math.min(bottom - viewport + margin, top));
  return y > scrollY ? y : null;
}

export interface ScrollReveal {
  scrollRef: RefObject<ScrollView | null>;
  /** The ScrollView's own onLayout: the height of the view. */
  onViewportLayout: (e: LayoutChangeEvent) => void;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The person scrolled: their scroll wins over a pending reveal. */
  onScrollBeginDrag: () => void;
  /** With `nested`, the target's parent, a direct child of the content. */
  onParentLayout: (e: LayoutChangeEvent) => void;
  /** The block to bring into view. */
  onTargetLayout: (e: LayoutChangeEvent) => void;
  /**
   * Bring the block into view if it isn't: now if everything is laid out,
   * else as soon as it is, then again on any layout change for a moment.
   */
  reveal: () => void;
  /** A new scroll view (a keyed remount) opens at the top: forget the offset. */
  reset: () => void;
}

/**
 * Brings one block of a scroll view into view, no further than needed, with
 * no motion under Reduce Motion. Positions are kept from layout and scroll
 * events, not measured. The Warm-up's pick did this first (playtests
 * 2026-11-01, 2026-11-03); Log after a category and the Warm-up's restored
 * pick share it (blind playtest 2026-11-12e, findings 3 and 4). A second
 * block of the same scroll view takes its own reveal with `scrollRef`, the
 * first one's, and the view's layout and scroll events passed to both.
 */
export function useScrollReveal({
  nested = false,
  scrollRef: shared,
}: { nested?: boolean; scrollRef?: RefObject<ScrollView | null> } = {}): ScrollReveal {
  const reduceMotion = useReducedMotion();
  const own = useRef<ScrollView>(null);
  const scrollRef = shared ?? own;
  const viewport = useRef(0);
  const scrollY = useRef(0);
  const parentY = useRef<number | null>(nested ? null : 0);
  const box = useRef<{ y: number; height: number } | null>(null);
  // A reveal asked for: waiting for layout (`until` null), then settling.
  const pending = useRef<{ until: number | null } | null>(null);

  const attempt = useCallback(() => {
    const want = pending.current;
    if (!want) return;
    if (want.until !== null && Date.now() > want.until) {
      pending.current = null;
      return;
    }
    if (viewport.current <= 0 || parentY.current === null || box.current === null) return;
    if (want.until === null) want.until = Date.now() + REVEAL_SETTLE_MS;
    const top = parentY.current + box.current.y;
    const y = revealScrollY({
      top,
      bottom: top + box.current.height,
      scrollY: scrollY.current,
      viewport: viewport.current,
      margin: space.lg,
    });
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: !reduceMotion });
  }, [reduceMotion, scrollRef]);

  return useMemo<ScrollReveal>(
    () => ({
      scrollRef,
      onViewportLayout: (e) => {
        viewport.current = e.nativeEvent.layout.height;
        attempt();
      },
      onScroll: (e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      },
      onScrollBeginDrag: () => {
        pending.current = null;
      },
      onParentLayout: (e) => {
        parentY.current = e.nativeEvent.layout.y;
        attempt();
      },
      onTargetLayout: (e) => {
        const { y, height } = e.nativeEvent.layout;
        box.current = { y, height };
        attempt();
      },
      reveal: () => {
        pending.current = { until: null };
        attempt();
      },
      reset: () => {
        scrollY.current = 0;
        pending.current = null;
        // The last keyed scroll's positions aren't this one's (code review
        // 2026-11-12).
        box.current = null;
        parentY.current = nested ? null : 0;
      },
    }),
    [attempt, nested, scrollRef],
  );
}

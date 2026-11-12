import { useCallback, useRef, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/** A pinned footer may take up to this share of the screen's height. */
export const PIN_MAX_SHARE = 0.25;

/**
 * Whether a footer stays pinned: up to a quarter of the screen it does; past
 * that it scrolls with the content, and stays there while the screen is open,
 * so a line that comes and goes ("Still needed…") can't move it back and
 * forth as the form fills in (code review 2026-11-12).
 */
export function keepsPinned(footerHeight: number, screenHeight: number, pinned: boolean): boolean {
  if (!pinned) return false;
  if (footerHeight <= 0 || screenHeight <= 0) return true;
  return footerHeight <= screenHeight * PIN_MAX_SHARE;
}

/**
 * The Warm-up's Next / Skip and Log's Save are pinned under a scrolling form
 * (2026-10-09), so they can't be lost below the fold. At large text sizes on
 * a small phone the pinned bar took about a third of the screen, and the
 * question and its controls sat under it (blind playtests 2026-11-12b run 3,
 * -12c runs 1, 2, -12d runs 1, 6). Past a quarter of the screen the bar goes
 * to the end of the scrolling content instead, for as long as the screen is
 * open. Measure the whole bar, including any line it shows. The height
 * compared is the window's; inside a page sheet (Log) that's the whole
 * screen, so a quarter of it is a little more of the sheet.
 */
export function usePinnedFooter(): {
  pinned: boolean;
  onFooterLayout: (e: LayoutChangeEvent) => void;
} {
  const { height } = useWindowDimensions();
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const onFooterLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = keepsPinned(e.nativeEvent.layout.height, height, pinnedRef.current);
      if (next !== pinnedRef.current) {
        pinnedRef.current = next;
        setPinned(next);
      }
    },
    [height],
  );
  return { pinned, onFooterLayout };
}

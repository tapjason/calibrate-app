import { useCallback, useRef, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/** A pinned footer may take up to this share of the screen's height. */
export const PIN_MAX_SHARE = 0.25;
/** Once it has let go, it pins again only under this share, so it can't flicker. */
export const PIN_AGAIN_SHARE = 0.2;

/**
 * Whether a footer stays pinned: under a quarter of the screen it does; past
 * that it scrolls with the content, and it pins again only under a fifth.
 */
export function keepsPinned(footerHeight: number, screenHeight: number, pinned: boolean): boolean {
  if (footerHeight <= 0 || screenHeight <= 0) return pinned;
  return footerHeight <= screenHeight * (pinned ? PIN_MAX_SHARE : PIN_AGAIN_SHARE);
}

/**
 * The Warm-up's Next / Skip and Log's Save are pinned under a scrolling form
 * (2026-10-09), so they can't be lost below the fold. At large text sizes on
 * a small phone the pinned bar took about a third of the screen, and the
 * question and its controls sat under it (blind playtests 2026-11-12b run 3,
 * -12c runs 1, 2, -12d runs 1, 6). Past a quarter of the screen the bar goes
 * to the end of the scrolling content instead. The footer is measured where
 * it is; render it at the same width in both places, so its height doesn't
 * change with the move.
 *
 * Measure only what's always there (the buttons), and pass the bar's fixed
 * padding as `extra`: a line that comes and goes ("Still needed…") would
 * otherwise move Save in and out of the scroll as the form fills in (code
 * review 2026-11-12). The height compared is the window's; inside a page sheet
 * (Log) that's the whole screen, so a quarter of it is a little more of the
 * sheet.
 */
export function usePinnedFooter(extra = 0): {
  pinned: boolean;
  onFooterLayout: (e: LayoutChangeEvent) => void;
} {
  const { height } = useWindowDimensions();
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const onFooterLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = keepsPinned(e.nativeEvent.layout.height + extra, height, pinnedRef.current);
      if (next !== pinnedRef.current) {
        pinnedRef.current = next;
        setPinned(next);
      }
    },
    [height, extra],
  );
  return { pinned, onFooterLayout };
}

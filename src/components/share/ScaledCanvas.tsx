import { useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * Every share card lays out on a canvas 360pt wide, whatever the phone
 * (roadmap steps 53 and 57). Captured at 3x, that is the 1080px-wide image
 * DESIGN_SYSTEM §7.5 specifies, and it looks the same from an iPhone mini as
 * from a Pro Max: same line breaks, nothing squeezed or overflowing.
 */
export const CARD_CANVAS_WIDTH = 360;

/** Each card's corner radius on the canvas, shared with the preview's outline. */
export const CARD_RADIUS = { identity: 24, wrapped: 20, warmup: 20 } as const;

/**
 * A width change this small, upward, is ignored once measured. On web the
 * card's height follows its width, so a page near the fold grew a scrollbar,
 * which narrowed the card, which shortened the page, which dropped the
 * scrollbar: the sheet jittered sideways for as long as it was open and taps
 * missed (2026-10-09 dry run). Taking the narrower of two near widths ends the
 * loop; a real resize or rotation is far larger than a scrollbar.
 */
const SCROLLBAR_SLACK = 24;

/** The next width to lay out at: narrowing always wins, a scrollbar's widening doesn't. */
export function nextCanvasWidth(current: number, measured: number): number {
  if (current === 0) return measured;
  if (measured > current && measured - current <= SCROLLBAR_SLACK) return current;
  return measured;
}

/**
 * The most of the window's height a preview may take. Scaled to the width
 * alone, a Post card in landscape was 757 × 1009 on a 375-tall screen, and
 * Story moved it off-screen (playtest 2026-11-08, finding 8). In portrait only
 * a Story on a 667pt-tall phone (iPhone SE) reaches it, and shrinks a little.
 */
export const MAX_PREVIEW_HEIGHT_SHARE = 0.8;

/**
 * The preview's scale: the width on screen over the canvas width, unless that
 * would make it taller than `maxHeight`. Exported for tests.
 */
export function previewScale(available: number, canvasHeight: number, maxHeight: number): number {
  if (available <= 0) return 1;
  const byWidth = available / CARD_CANVAS_WIDTH;
  if (canvasHeight <= 0 || maxHeight <= 0) return byWidth;
  return Math.min(byWidth, maxHeight / canvasHeight);
}

interface ScaledCanvasProps {
  /** A fixed canvas height (the identity card's Post and Story), or omit to take the card's own. */
  height?: number;
  /**
   * The card's corner radius on the canvas (`CARD_RADIUS`). Draws a hairline
   * round the preview: the free cards sit close to the canvas in tone (the
   * light Wrapped card on the light canvas, Midnight on the dark one, about
   * 1.1:1), and without it the preview had no edge (roadmap D33).
   */
  radius?: number;
  children: ReactNode;
  testID?: string;
}

/**
 * Shows a card at the canvas width, scaled to the width on screen. The scale
 * sits on this wrapper, never on the card, so a capture of the card's ref
 * gets the canvas at its own size. Until the screen width is known the card
 * waits unseen, so a narrow phone never flashes it at full size.
 *
 * The card is placed absolutely, so the wrapper's height never constrains it.
 * In flow, a card that takes its own height measured inside a wrapper still 0
 * tall: on the phone it was squashed to its padding, measured that, and the
 * preview stayed collapsed under the Share button (first device run,
 * 2026-11-08, This week). A browser never squashes content below its own
 * height, so web hid it.
 */
export function ScaledCanvas({ height, radius, children, testID }: ScaledCanvasProps) {
  const [available, setAvailable] = useState(0);
  const [measured, setMeasured] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const canvasHeight = height ?? measured;
  const scale = previewScale(available, canvasHeight, windowHeight * MAX_PREVIEW_HEIGHT_SHARE);
  // Capped by the height, the card is narrower than the room: centre it.
  const inset = available > 0 ? Math.max(0, (available - CARD_CANVAS_WIDTH * scale) / 2) : 0;

  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setAvailable((current) => nextCanvasWidth(current, w));
      }}
      style={[{ height: canvasHeight * scale }, available === 0 && styles.unmeasured]}
      testID={testID}
    >
      <View
        style={[styles.canvas, { left: inset, transform: [{ scale }] }]}
        onLayout={height === undefined ? (e) => setMeasured(e.nativeEvent.layout.height) : undefined}
        testID={testID ? `${testID}-canvas` : undefined}
      >
        {children}
      </View>
      {/* Outside the card, so a capture of its ref never includes it. Sized
          to the scaled card, not to this wrapper: a widening the scale
          ignores (a scrollbar going, nextCanvasWidth) would leave a
          wrapper-sized outline standing past the card's edge. */}
      {radius !== undefined && (
        <View
          pointerEvents="none"
          aria-hidden
          style={[
            styles.outline,
            {
              borderRadius: radius * scale,
              height: canvasHeight * scale,
              left: inset,
              width: CARD_CANVAS_WIDTH * scale,
            },
          ]}
          testID={testID ? `${testID}-outline` : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  unmeasured: { opacity: 0 },
  canvas: {
    left: 0,
    position: 'absolute',
    top: 0,
    transformOrigin: 'top left',
    width: CARD_CANVAS_WIDTH,
  },
  outline: {
    borderColor: colors.hairline,
    left: 0,
    position: 'absolute',
    top: 0,
    borderWidth: 1,
  },
});

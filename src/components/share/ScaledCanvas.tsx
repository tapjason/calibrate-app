import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Every share card lays out on a canvas 360pt wide, whatever the phone
 * (roadmap steps 53 and 57). Captured at 3x, that is the 1080px-wide image
 * DESIGN_SYSTEM §7.5 specifies, and it looks the same from an iPhone mini as
 * from a Pro Max: same line breaks, nothing squeezed or overflowing.
 */
export const CARD_CANVAS_WIDTH = 360;

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

interface ScaledCanvasProps {
  /** A fixed canvas height (the identity card's Post and Story), or omit to take the card's own. */
  height?: number;
  children: ReactNode;
  testID?: string;
}

/**
 * Shows a card at the canvas width, scaled to the width on screen. The scale
 * sits on this wrapper, never on the card, so a capture of the card's ref
 * gets the canvas at its own size. Until the screen width is known the card
 * waits unseen, so a narrow phone never flashes it at full size.
 */
export function ScaledCanvas({ height, children, testID }: ScaledCanvasProps) {
  const [available, setAvailable] = useState(0);
  const [measured, setMeasured] = useState(0);
  const scale = available > 0 ? available / CARD_CANVAS_WIDTH : 1;
  const canvasHeight = height ?? measured;

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
        style={[styles.canvas, { transform: [{ scale }] }]}
        onLayout={height === undefined ? (e) => setMeasured(e.nativeEvent.layout.height) : undefined}
        testID={testID ? `${testID}-canvas` : undefined}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unmeasured: { opacity: 0 },
  canvas: { transformOrigin: 'top left', width: CARD_CANVAS_WIDTH },
});

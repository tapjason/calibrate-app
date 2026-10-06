import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Every share card lays out on a canvas 360pt wide, whatever the phone
 * (roadmap steps 53 and 57). Captured at 3x, that is the 1080px-wide image
 * DESIGN_SYSTEM §7.5 specifies, and it looks the same from an iPhone mini as
 * from a Pro Max: same line breaks, nothing squeezed or overflowing.
 */
export const CARD_CANVAS_WIDTH = 360;

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
      onLayout={(e) => setAvailable(e.nativeEvent.layout.width)}
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

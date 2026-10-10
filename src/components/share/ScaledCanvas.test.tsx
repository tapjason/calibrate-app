import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { CARD_CANVAS_WIDTH, nextCanvasWidth, ScaledCanvas } from './ScaledCanvas';

const layout = (width: number, height: number) => ({
  nativeEvent: { layout: { width, height, x: 0, y: 0 } },
});

// Roadmap step 57: every card on one 360pt canvas, scaled to the screen.
describe('ScaledCanvas', () => {
  it('lays the card out at the canvas width, scaled from the top left', () => {
    render(
      <ScaledCanvas testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    fireEvent(screen.getByTestId('p'), 'layout', layout(288, 0));
    const canvas = StyleSheet.flatten(screen.getByTestId('p-canvas').props.style);
    expect(canvas.width).toBe(CARD_CANVAS_WIDTH);
    expect(canvas.transform).toEqual([{ scale: 0.8 }]);
    expect(canvas.transformOrigin).toBe('top left');
  });

  it("takes a content-sized card's own height, scaled", () => {
    render(
      <ScaledCanvas testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    fireEvent(screen.getByTestId('p'), 'layout', layout(288, 0));
    fireEvent(screen.getByTestId('p-canvas'), 'layout', layout(360, 500));
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).height).toBe(400);
  });

  it('keeps a fixed height when given one', () => {
    render(
      <ScaledCanvas height={480} testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    fireEvent(screen.getByTestId('p'), 'layout', layout(180, 0));
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).height).toBe(240);
  });

  it('stays unseen until it knows the width it has', () => {
    render(
      <ScaledCanvas testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).opacity).toBe(0);
  });
});

// The 2026-10-09 dry run: on web a scrollbar toggling on and off kept the
// Share sheet jittering. Narrowing wins; a scrollbar's widening doesn't.
describe('nextCanvasWidth', () => {
  it('takes the first width, and any narrower one', () => {
    expect(nextCanvasWidth(0, 335)).toBe(335);
    expect(nextCanvasWidth(335, 320)).toBe(320);
  });

  it('ignores a scrollbar-sized widening, so the loop ends', () => {
    expect(nextCanvasWidth(320, 335)).toBe(320);
  });

  it('follows a real resize', () => {
    expect(nextCanvasWidth(320, 400)).toBe(400);
  });
});

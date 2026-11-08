import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { CARD_CANVAS_WIDTH, nextCanvasWidth, previewScale, ScaledCanvas } from './ScaledCanvas';

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
    // Out of flow, so the wrapper's height (0 until measured) can't squash
    // the card it measures (first device run, 2026-11-08).
    expect(canvas.position).toBe('absolute');
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

// Playtest 2026-11-08, finding 8: in landscape a Post card scaled to the
// width was 1009 tall on a 375-tall screen.
describe('previewScale', () => {
  it('scales to the width when the card fits the height', () => {
    expect(previewScale(288, 480, 600)).toBe(0.8);
  });

  it('caps the scale so the card is no taller than allowed', () => {
    // 757 wide in landscape, a 480-tall Post, 300 allowed: 300 / 480.
    expect(previewScale(757, 480, 300)).toBe(0.625);
  });

  it('scales to the width until the height is known', () => {
    expect(previewScale(288, 0, 300)).toBe(0.8);
    expect(previewScale(0, 480, 300)).toBe(1);
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

// Roadmap D33: the free cards sit close to the canvas in tone, so the preview
// gets a hairline at the card's own corner radius, outside the captured card.
describe('ScaledCanvas outline', () => {
  it('draws a hairline at the card radius, scaled with the card', () => {
    render(
      <ScaledCanvas radius={20} testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    fireEvent(screen.getByTestId('p'), 'layout', layout(288, 0));
    const outline = StyleSheet.flatten(
      screen.getByTestId('p-outline', { includeHiddenElements: true }).props.style,
    );
    expect(outline.borderRadius).toBe(16);
    expect(outline.borderWidth).toBe(1);
    expect(outline.position).toBe('absolute');
  });

  it('stays the size of the card when a scrollbar-sized widening is ignored', () => {
    render(
      <ScaledCanvas height={480} radius={24} testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    fireEvent(screen.getByTestId('p'), 'layout', layout(343, 0));
    // A scrollbar goes: 15pt wider, which the scale ignores (nextCanvasWidth).
    fireEvent(screen.getByTestId('p'), 'layout', layout(358, 0));
    const outline = StyleSheet.flatten(
      screen.getByTestId('p-outline', { includeHiddenElements: true }).props.style,
    );
    expect(outline.width).toBeCloseTo(343);
    expect(outline.height).toBeCloseTo(480 * (343 / CARD_CANVAS_WIDTH));
  });

  it('sits outside the card, so a capture of the card never holds it', () => {
    render(
      <ScaledCanvas radius={24} testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    const canvas = screen.getByTestId('p-canvas');
    expect(canvas.findAllByProps({ testID: 'p-outline' })).toHaveLength(0);
  });

  it('draws none without a radius', () => {
    render(
      <ScaledCanvas testID="p">
        <Text>card</Text>
      </ScaledCanvas>,
    );
    expect(screen.queryByTestId('p-outline', { includeHiddenElements: true })).toBeNull();
  });
});

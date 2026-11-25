import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { useCategoryStore } from '@/store/categoryStore';

import { CategoryIcon, EMOJI_FONT_SCALE, emojiStyle } from './Icon';

// The owner, TestFlight build 15 (2026-11-24): on Log's chips an added
// category's emoji ("⚽ Football") lost about a third on the right. The text
// was held to the icon box's width at the box's own font size, and an emoji
// glyph is wider than its font size; the iPhone draws a text view only inside
// its frame.
describe('a chosen emoji in its icon box', () => {
  // Every size the app draws a category icon at: card rows, details and
  // Resolve, chips, badges, the Categories manager, the icon editor.
  const SIZES = [13, 14, 15, 16, 22, 28];
  // Emoji fonts draw about a quarter wider than their font size.
  const EMOJI_ADVANCE = 1.25;

  it.each(SIZES)('keeps the glyph about the box and its frame wider at %i pt', (size) => {
    const style = emojiStyle(size, 'black');
    const fontSize = style.fontSize as number;
    // The glyph is about the box, never much wider.
    expect(fontSize * EMOJI_ADVANCE).toBeLessThanOrEqual(size + 1);
    expect(fontSize).toBeGreaterThanOrEqual(Math.floor(size * EMOJI_FONT_SCALE));
    // The text's frame never holds the glyph to the box: room on each side.
    expect(style.width as number).toBeGreaterThanOrEqual(fontSize * EMOJI_ADVANCE * 1.5);
    expect(style.flexShrink).toBe(0);
    expect(style.textAlign).toBe('center');
    // No fixed line height, which could cut the glyph's top or bottom.
    expect(style.lineHeight).toBeUndefined();
  });

  it('draws in a box of the icon size, centred, under its own frame', () => {
    useCategoryStore.setState({
      defs: [
        {
          id: 'c-football',
          user_id: 'u1',
          name: 'Football',
          icon: { kind: 'emoji', emoji: '⚽' },
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    try {
      render(<CategoryIcon category="c-football" size={15} color="black" />);
      const box = screen.getByTestId('category-icon-emoji', { includeHiddenElements: true });
      const boxStyle = StyleSheet.flatten(box.props.style);
      // The box keeps the icon size, so the chip's label doesn't move.
      expect(boxStyle).toEqual(
        expect.objectContaining({ width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }),
      );
      const glyph = screen.UNSAFE_getByType(Text);
      const textStyle = StyleSheet.flatten(glyph.props.style);
      expect(textStyle.fontSize).toBe(12);
      expect(textStyle.width).toBe(30);
      expect(glyph.props.children).toBe('⚽');
    } finally {
      useCategoryStore.setState({ defs: [] });
    }
  });
});

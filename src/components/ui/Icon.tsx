import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Image, Text, View, type TextStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useCategoryStore } from '@/store/categoryStore';
import { isBuiltInCategory, type BuiltInCategory, type Category } from '@/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  /** SF Symbol for iOS. */
  sf: SFSymbol;
  /** Ionicons glyph for Android and web, where SF Symbols don't exist. */
  fallback: IoniconName;
  size?: number;
  color: string;
  testID?: string;
}

/**
 * One icon, native on each platform (DESIGN_SYSTEM §5): an SF Symbol on iOS,
 * the matching Ionicon elsewhere. Icons are decorative here — every one sits
 * beside a written label — so they carry no accessibility label of their own,
 * and they're hidden from assistive tech outright: on web the Ionicons glyph
 * is a private-use character that screen readers read out (roadmap step 42).
 */
export function Icon({ sf, fallback, size = 20, color, testID }: IconProps) {
  const ion = <Ionicons name={fallback} size={size} color={color} testID={testID} />;
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView
        name={{ ios: sf }}
        size={size}
        tintColor={color}
        fallback={ion}
        testID={testID}
      />
    </View>
  );
}

/**
 * Categories are told apart by symbol + word, never by colour (DESIGN_SYSTEM
 * §2.4, §5).
 */
export const CATEGORY_ICONS: Record<BuiltInCategory, { sf: SFSymbol; fallback: IoniconName }> = {
  work: { sf: 'briefcase.fill', fallback: 'briefcase' },
  health: { sf: 'heart.fill', fallback: 'heart' },
  finance: { sf: 'dollarsign.circle.fill', fallback: 'cash' },
  social: { sf: 'person.2.fill', fallback: 'people' },
  personal: { sf: 'person.fill', fallback: 'person' },
};

const ADDED_ICON: { sf: SFSymbol; fallback: IoniconName } = { sf: 'tag.fill', fallback: 'pricetag' };

/**
 * An emoji's font size, as a share of its icon box. Emoji fonts (Apple Color
 * Emoji, Noto Color Emoji) draw a glyph about a quarter wider than their font
 * size, so at 80% the glyph is about the box, as large as the symbols beside
 * it (playtest 2026-11-03 found 85% of the box's size, drawn on web, smaller).
 */
export const EMOJI_FONT_SCALE = 0.8;

/**
 * A chosen emoji's text style in a `size` box. At the box's own font size the
 * glyph was wider than the box, and on the iPhone a text view only draws
 * inside its frame, which its box held to `size`: Log's chips cut off about a
 * third of the emoji on the right (the owner, TestFlight build 15,
 * 2026-11-24). So the font is a little under the box, the text's own frame
 * is twice the box and centred on it, so whatever an emoji font draws past
 * the box is never cut (it falls into the gap beside it), and there is no
 * fixed line height, which could cut it at the top or bottom. The box itself
 * keeps `size`, so nothing beside it moves. Exported for tests.
 */
export function emojiStyle(size: number, color: string): TextStyle {
  return {
    color,
    fontSize: Math.round(size * EMOJI_FONT_SCALE),
    width: size * 2,
    flexShrink: 0,
    textAlign: 'center',
  };
}

export function CategoryIcon({
  category,
  size = 16,
  color,
}: {
  category: Category;
  size?: number;
  color: string;
}) {
  // The person's own emoji or picture (roadmap D40), shown as it is, in its
  // own colours: the one place on screen a colour means "your icon".
  const own = useCategoryStore((s) => s.defs.find((d) => d.id === category)?.icon ?? null);
  if (own) {
    return (
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          // Centred: the emoji's font size keeps it inside the box (below),
          // so it no longer sticks out past the edge the symbols and text
          // keep (playtest 2026-11-08b, finding 26).
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID={`category-icon-${own.kind}`}
      >
        {own.kind === 'emoji' ? (
          <Text allowFontScaling={false} style={emojiStyle(size, color)}>
            {own.emoji}
          </Text>
        ) : (
          <Image
            source={{ uri: own.uri }}
            style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
          />
        )}
      </View>
    );
  }
  // A category the person added (roadmap D39) has no symbol of its own: a tag.
  const { sf, fallback } = isBuiltInCategory(category) ? CATEGORY_ICONS[category] : ADDED_ICON;
  return <Icon sf={sf} fallback={fallback} size={size} color={color} />;
}

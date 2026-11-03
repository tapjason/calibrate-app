import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Image, Text, View } from 'react-native';
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
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        testID={`category-icon-${own.kind}`}
      >
        {own.kind === 'emoji' ? (
          // At the icon size, as large as the symbols beside it: at 85% it
          // drew 11 px against 13 px symbols on Today (playtest 2026-11-03).
          <Text
            allowFontScaling={false}
            style={{
              color,
              fontSize: size,
              lineHeight: Math.round(size * 1.2),
              textAlign: 'center',
            }}
          >
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

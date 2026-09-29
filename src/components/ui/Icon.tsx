import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { Category } from '@/types';

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
 * beside a written label — so they carry no accessibility label of their own.
 */
export function Icon({ sf, fallback, size = 20, color, testID }: IconProps) {
  const ion = <Ionicons name={fallback} size={size} color={color} testID={testID} />;
  return (
    <SymbolView
      name={{ ios: sf }}
      size={size}
      tintColor={color}
      fallback={ion}
      testID={testID}
    />
  );
}

/**
 * Categories are told apart by symbol + word, never by colour (DESIGN_SYSTEM
 * §2.4, §5).
 */
export const CATEGORY_ICONS: Record<Category, { sf: SFSymbol; fallback: IoniconName }> = {
  work: { sf: 'briefcase.fill', fallback: 'briefcase' },
  health: { sf: 'heart.fill', fallback: 'heart' },
  finance: { sf: 'dollarsign.circle.fill', fallback: 'cash' },
  social: { sf: 'person.2.fill', fallback: 'people' },
  personal: { sf: 'person.fill', fallback: 'person' },
};

export function CategoryIcon({
  category,
  size = 16,
  color,
}: {
  category: Category;
  size?: number;
  color: string;
}) {
  const { sf, fallback } = CATEGORY_ICONS[category];
  return <Icon sf={sf} fallback={fallback} size={size} color={color} />;
}

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { buildShareCard, shareLines } from '@/components/share/cardCopy';
import { LensEmblem } from '@/components/ui/LensEmblem';
import { colors, space, type } from '@/constants/theme';
import type { BadgeLevel, CategoryStat, UserStat } from '@/types';

export interface HomeIdentity {
  identity: string;
  contrast: string | null;
  badge: BadgeLevel;
}

/**
 * The identity line for Home (roadmap step 28), from the same helpers as the
 * share card, so the two never disagree. Null until some category has climbed
 * past Guesser: before that it would only repeat "Guesser" every day.
 */
export function homeIdentity(
  userStat: UserStat | null,
  categoryStats: CategoryStat[],
): HomeIdentity | null {
  const card = buildShareCard(userStat, categoryStats);
  const best = card?.categories[0];
  if (!card || !best || best.badge_level === 'guesser') return null;
  return { ...shareLines(card), badge: best.badge_level };
}

interface IdentityLineProps {
  userStat: UserStat | null;
  categoryStats: CategoryStat[];
  /**
   * Explains the tiers (How scoring works, at Badges: roadmap D27). It opened
   * the share card until 2026-10-10; two testers expected an explanation.
   */
  onPress: () => void;
}

/**
 * "Sharp in health", with the contrast smaller beneath: the product's
 * identity framing (CLAUDE.md) on the screen people open most, not only on
 * the share card.
 */
export function IdentityLine({ userStat, categoryStats, onPress }: IdentityLineProps) {
  const line = homeIdentity(userStat, categoryStats);
  if (!line) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={line.contrast ? `${line.identity}. ${line.contrast}.` : `${line.identity}.`}
      accessibilityHint="Explains the badges"
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      testID="home-identity"
    >
      <View style={styles.row}>
        <LensEmblem tier={line.badge} size={22} />
        <Text style={styles.identity}>{line.identity}</Text>
      </View>
      {line.contrast && <Text style={styles.contrast}>{line.contrast}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xxs, marginTop: space.md, minHeight: 44 },
  pressed: { opacity: 0.6 },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  identity: { ...type.title3, color: colors.textPrimary },
  contrast: { ...type.subhead, color: colors.textSecondary },
});

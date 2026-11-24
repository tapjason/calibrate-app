import { Pressable, StyleSheet, Text } from 'react-native';

import { nextBadgeProgress } from '@/components/share/nextBadgeCopy';
import { colors, space, type } from '@/constants/theme';
import { categoryOptions, useCategoryStore } from '@/store/categoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { Category } from '@/types';

import { homeIdentity, namedOnToday } from './IdentityLine';

interface NextBadgeLineProps {
  /** What a badge takes (How scoring works, at Badges), as the identity line does. */
  onPress: () => void;
}

/**
 * The closest badge, on Today, while no category has one (step 173): "13 more
 * scored answers to your first badge in finance." (D76). A bettor with 73 answers over 13
 * categories saw no badge line at all and nothing saying why (blind playtest
 * 2026-11-12f, finding 6). The weekly recap's words, a count, never a score
 * built on noise. It aims only at a category Log still offers (one hidden
 * from Log can't be logged in), and, Today being private, at every one, where
 * the recap leaves out the categories left off the card, so the two can name
 * different categories (record audit 2026-11-12).
 */
export function NextBadgeLine({ onPress }: NextBadgeLineProps) {
  // A rename re-renders the line (the identity line's reason).
  useCategoryStore((s) => s.defs);
  const userStat = useStatsStore((s) => s.userStat);
  const hideTitles = useSettingsStore((s) => s.hideTitles);
  // Not a name the person chose while the words are hidden (D62).
  const categoryStats = namedOnToday(useStatsStore((s) => s.categoryStats), hideTitles);
  const nextBadges = useStatsStore((s) => s.nextBadges);
  const categoryRanges = useStatsStore((s) => s.categoryRanges);
  if (homeIdentity(userStat, categoryStats)) return null;
  const giveOrTake = Object.fromEntries(
    Object.entries(categoryRanges).map(([c, r]) => [c, r?.giveOrTake ?? 0]),
  ) as Partial<Record<Category, number>>;
  const offered = new Set(categoryOptions());
  const next = nextBadgeProgress(
    categoryStats.filter((c) => offered.has(c.category)),
    nextBadges,
    giveOrTake,
  );
  if (!next) return null;
  // Today's own words (D76); the recap card keeps its "To reach" line.
  const { line } = next;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={line}
      accessibilityHint="Explains the badges"
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      testID="home-next-badge"
    >
      <Text style={styles.text}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginBottom: space.sm, minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  text: { ...type.subhead, color: colors.textSecondary },
});

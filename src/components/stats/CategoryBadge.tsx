import { StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/ui/Icon';
import { LensEmblem } from '@/components/ui/LensEmblem';
import { BADGE_META } from '@/constants/badges';
import { colors, type } from '@/constants/theme';
import type { CategoryStat, NextBadgeTarget } from '@/types';

interface CategoryBadgeProps {
  stat: CategoryStat;
  /** The next badge up the ladder, or null when already at the top (oracle). */
  next: NextBadgeTarget | null;
}

/**
 * One category row: the category name, its current badge as a colored chip,
 * and a one-line progress hint toward the next badge. Pure presentation —
 * the badge level and next-target are computed upstream (L3 engine via L4
 * store); this component only formats them.
 */
export function CategoryBadge({ stat, next }: CategoryBadgeProps) {
  const meta = BADGE_META[stat.badge_level];
  const hint = progressHint(stat, next);

  // One sentence for a screen reader (roadmap step 43) instead of the name,
  // the hint with its arrow read aloud, and the badge word as three stops.
  const category = stat.category.charAt(0).toUpperCase() + stat.category.slice(1);
  const spoken = `${category}: ${meta.label}. ${spokenHint(hint)}.`;

  return (
    <View
      style={styles.row}
      testID={`category-${stat.category}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
    >
      <View style={styles.left}>
        <View style={styles.categoryRow}>
          <CategoryIcon category={stat.category} size={16} color={colors.textSecondary} />
          <Text style={styles.category}>{stat.category}</Text>
        </View>
        <Text style={styles.hint} testID={`category-${stat.category}-hint`}>
          {hint}
        </Text>
      </View>
      <View
        style={[styles.chip, { backgroundColor: meta.background }]}
        testID={`badge-${stat.category}`}
      >
        <LensEmblem tier={stat.badge_level} size={22} />
        <Text style={[styles.chipLabel, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

/** The hint as it should sound: "3 more resolved to reach Tracker". */
export function spokenHint(hint: string): string {
  return hint.replace(' → ', ' to reach ').replace(' · ', ', ');
}

/**
 * Build the progress line. When there's a next badge, name every requirement
 * still unmet: more resolutions, a higher score, or both. Naming only the
 * count when the score is short too ("20 more resolved → Sharp" for a work
 * score of 80) promised a badge that resolving alone can't earn (roadmap
 * step 47). At the top of the ladder, celebrate instead.
 */
function progressHint(stat: CategoryStat, next: NextBadgeTarget | null): string {
  if (!next) {
    return `${stat.predictions_resolved} resolved · top badge reached`;
  }

  const nextLabel = BADGE_META[next.badge].label;
  const scoreShort = next.needScore !== null && stat.calibration_score <= next.needScore;

  if (next.needResolved !== null && stat.predictions_resolved < next.needResolved) {
    const remaining = next.needResolved - stat.predictions_resolved;
    const andScore = scoreShort ? ` and a score above ${next.needScore}` : '';
    return `${remaining} more resolved${andScore} → ${nextLabel}`;
  }

  if (scoreShort) {
    return `Score above ${next.needScore} → ${nextLabel}`;
  }

  // Thresholds already met (e.g. score qualifies but the higher badge also
  // needs a resolution count handled above) — surface the badge as in reach.
  return `Almost ${nextLabel}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  left: { flex: 1, paddingRight: 12 },
  categoryRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  category: {
    ...type.subhead,
    fontWeight: '600',
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  hint: { ...type.caption, fontWeight: '400', color: colors.textTertiary, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  chipLabel: { ...type.footnote, fontWeight: '700' },
});

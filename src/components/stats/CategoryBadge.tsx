import { StyleSheet, Text, View } from 'react-native';

import { BADGE_META } from '@/constants/badges';
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

  return (
    <View style={styles.row} testID={`category-${stat.category}`}>
      <View style={styles.left}>
        <Text style={styles.category}>{stat.category}</Text>
        <Text style={styles.hint} testID={`category-${stat.category}-hint`}>
          {hint}
        </Text>
      </View>
      <View
        style={[styles.chip, { backgroundColor: meta.background }]}
        testID={`badge-${stat.category}`}
      >
        <Text style={styles.chipEmoji}>{meta.emoji}</Text>
        <Text style={[styles.chipLabel, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

/**
 * Build the progress line. When there's a next badge, describe the single
 * unmet requirement closest to hand (more resolutions, or a higher score).
 * At the top of the ladder, celebrate instead.
 */
function progressHint(stat: CategoryStat, next: NextBadgeTarget | null): string {
  if (!next) {
    return `${stat.predictions_resolved} resolved · top badge reached`;
  }

  const nextLabel = BADGE_META[next.badge].label;

  if (next.needResolved !== null && stat.predictions_resolved < next.needResolved) {
    const remaining = next.needResolved - stat.predictions_resolved;
    return `${remaining} more resolved → ${nextLabel}`;
  }

  if (next.needScore !== null && stat.calibration_score <= next.needScore) {
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
    borderBottomColor: '#f3f4f6',
  },
  left: { flex: 1, paddingRight: 12 },
  category: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 13, fontWeight: '700' },
});

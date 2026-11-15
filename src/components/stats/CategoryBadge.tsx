import { StyleSheet, Text, View } from 'react-native';

import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { localCount } from '@/components/ui/count';
import { holdTarget } from '@/components/ui/holdRanges';
import { LensEmblem } from '@/components/ui/LensEmblem';
import { BADGE_META } from '@/constants/badges';
import { colors, type } from '@/constants/theme';
import type { CategoryCounts, CategoryStat, NextBadgeTarget } from '@/types';
import {
  isNamedCategory,
  isOwnCategory,
  useCategoryStore,
  visibleCategoryTitle,
} from '@/store/categoryStore';
import { useSettingsStore } from '@/store/settingsStore';

import { plainCountsLine } from './beforeScoreCopy';

interface CategoryBadgeProps {
  stat: CategoryStat;
  /** The next badge up the ladder, or null when already at the top (oracle). */
  next: NextBadgeTarget | null;
  /**
   * The category score's give-or-take (roadmap D35): said beside the score,
   * and taken off it before a tier above Tracker counts.
   */
  giveOrTake?: number;
  /** The list's widest pill, so every row's pill is that wide (finding 18). */
  pillMinWidth?: number;
  /** Reports this pill's width to the list. */
  onPillWidth?: (width: number) => void;
  /** Plain counts, said before the score unlocks (roadmap D53). */
  counts?: CategoryCounts | null;
}

/**
 * One category row: the category name, its current badge as a colored chip,
 * and a one-line progress hint toward the next badge. Pure presentation —
 * the badge level and next-target are computed upstream (L3 engine via L4
 * store); this component only formats them.
 */
export function CategoryBadge({
  stat,
  next,
  giveOrTake = 0,
  pillMinWidth = 0,
  onPillWidth,
  counts = null,
}: CategoryBadgeProps) {
  const meta = BADGE_META[stat.badge_level];
  const hint = progressHint(stat, next, giveOrTake);

  // One sentence for a screen reader (roadmap step 43) instead of the name,
  // the hint with its arrow read aloud, and the badge word as three stops.
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  // Not a name or an icon the person chose while the words are hidden (D62);
  // a built-in given only an icon keeps its word (owner, 2026-11-14).
  const hideTitles = useSettingsStore((s) => s.hideTitles);
  const nameHidden = hideTitles && isNamedCategory(stat.category);
  const iconPlain = hideTitles && isOwnCategory(stat.category);
  const name = visibleCategoryTitle(stat.category, hideTitles);
  const category = name;
  // The category's own score once it's past MIN_N_CATEGORY (roadmap D28):
  // "how am I doing in money" had no number. Never while provisional, which
  // is the engine's flag, not a count kept here.
  const score = stat.score_is_provisional ? null : Math.round(stat.calibration_score);
  const receipt =
    score === null ? null : scoreReceipt(score, stat.predictions_resolved, giveOrTake);
  // Before the score, what was said and what happened, never a verdict
  // (roadmap D53; blind playtest 2026-11-09b, finding 2).
  const plain = score === null && counts ? plainCountsLine(counts) : null;
  const spokenScore =
    score === null
      ? ''
      : `, score ${score}${giveOrTake > 0 ? ` give or take ${giveOrTake}` : ''} from ${stat.predictions_resolved} scored`;
  const spoken = `${category}: ${meta.label}${spokenScore}.${plain ? ` ${plain}` : ''} ${spokenHint(hint)}.`;

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
          {nameHidden ? (
            <Icon sf="folder" fallback="folder-outline" size={16} color={colors.textSecondary} />
          ) : (
            <CategoryIcon
              category={stat.category}
              size={16}
              color={colors.textSecondary}
              plain={iconPlain}
            />
          )}
          <Text style={styles.category} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {receipt && (
          <Text style={styles.score} testID={`category-${stat.category}-score`}>
            {receipt}
          </Text>
        )}
        {plain && (
          <Text style={styles.score} testID={`category-${stat.category}-counts`}>
            {plain}
          </Text>
        )}
        <Text style={styles.hint} testID={`category-${stat.category}-hint`}>
          {holdTarget(hint)}
        </Text>
      </View>
      <View
        style={[styles.chip, { backgroundColor: meta.background, minWidth: pillMinWidth }]}
        onLayout={onPillWidth ? (e) => onPillWidth(e.nativeEvent.layout.width) : undefined}
        testID={`badge-${stat.category}`}
      >
        <LensEmblem tier={stat.badge_level} size={22} />
        <Text style={[styles.chipLabel, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

/**
 * "Score 84, give or take 5, from 52 scored": a category's receipt once its
 * score is unlocked, with how far luck could move it (roadmap D35). One answer
 * moved a 17-answer score five points, unannounced (blind playtest
 * 2026-11-01).
 */
export function scoreReceipt(score: number, resolved: number, giveOrTake = 0): string {
  return giveOrTake > 0
    ? `Score ${score}, give or take ${giveOrTake}, from ${localCount(resolved)} scored`
    : `Score ${score}, ${localCount(resolved)} scored`;
}

/**
 * The hint as it should sound: "3 more scored answers to reach Tracker". The hint
 * is written that way now (roadmap D33 dropped the "→"), so this is the
 * written hint itself; kept so screen-reader labels have one source.
 */
export function spokenHint(hint: string): string {
  return hint;
}

/**
 * Build the progress line. When there's a next badge, name every requirement
 * still unmet: more resolutions, a higher score, or both. Naming only the
 * count when the score is short too ("20 more scored answers to reach Sharp" for a work
 * score of 80) promised a badge that resolving alone can't earn (roadmap
 * step 47). At the top of the ladder, celebrate instead.
 */
function progressHint(
  stat: CategoryStat,
  next: NextBadgeTarget | null,
  giveOrTake = 0,
): string {
  if (!next) {
    return `${localCount(stat.predictions_resolved)} scored, top badge reached`;
  }

  const nextLabel = BADGE_META[next.badge].label;
  // Short counting the give-or-take (roadmap D35), and said that way every
  // time: "even at its low end" only when the score itself cleared the bar
  // read as two different rules (blind playtest 2026-11-04, runs 2 and 5).
  const low = stat.calibration_score - giveOrTake;
  const scoreShort = next.needScore !== null && low <= next.needScore;
  const scoreClause = `score above ${next.needScore} at its low end`;

  if (next.needResolved !== null && stat.predictions_resolved < next.needResolved) {
    const remaining = next.needResolved - stat.predictions_resolved;
    const andScore = scoreShort ? ` and a ${scoreClause}` : '';
    const answers = remaining === 1 ? 'answer' : 'answers';
    return `${remaining} more scored ${answers}${andScore} to reach ${nextLabel}`;
  }

  if (scoreShort) {
    return `S${scoreClause.slice(1)} to reach ${nextLabel}`;
  }

  // Thresholds already met (e.g. score qualifies but the higher badge also
  // needs a resolution count handled above) — surface the badge as in reach.
  return `Almost ${nextLabel}`;
}

const styles = StyleSheet.create({
  // The badge pill keeps its own slot. When the words and the pill don't fit
  // on one line (large text, a narrow screen), the pill wraps under the words
  // instead of squeezing them to a letter a line ("Scor / e 87") or sitting
  // on a long name (playtest 2026-11-08, findings 1 and 2).
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    rowGap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  left: { flexBasis: 160, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  categoryRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  category: {
    ...type.subhead,
    flexShrink: 1,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // The number in secondary ink, never display size: the overall rating is
  // the one hero (DESIGN_SYSTEM §7.4).
  score: { ...type.footnote, color: colors.textSecondary, marginTop: 2 },
  hint: { ...type.caption, fontWeight: '400', color: colors.textTertiary, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  chipLabel: { ...type.footnote, fontWeight: '700' },
});

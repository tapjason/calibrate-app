import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface UnlockProgressProps {
  /** Yes/no resolutions so far. */
  resolved: number;
  /** Open predictions — each will count once it resolves. */
  pending: number;
  /** Resolutions needed to unlock (MIN_N_OVERALL or MIN_N_CATEGORY). */
  total: number;
  /** When the next resolution can come (roadmap step 32), or null. */
  nextDue?: string | null;
  /**
   * Before anything has resolved, when the first answer comes (roadmap D30),
   * a sentence ("Your first answer lands tomorrow evening."), shown above the
   * bar so the nearest thing comes first. Null otherwise.
   */
  lead?: string | null;
  /** When it could unlock at the recent pace (roadmap D53), or null. */
  estimate?: string | null;
  /** The first look's plain counts from 10 scored answers (D62), or null. */
  firstLook?: string | null;
  testID?: string;
}

/**
 * The provisional state of a score: a segmented bar instead of a number
 * (DESIGN_SYSTEM §0 rule 2, §7.1). A big "12" in the hero slot reads as a
 * score of 12; a bar filling toward a line can't be mistaken for one.
 *
 * Three kinds of segment, told apart by fill *and* outline so colour isn't
 * the only channel: solid = resolved, dashed outline = on its way (an open
 * prediction that will count when it resolves), hollow = still to log.
 * Counting open predictions is honest endowed progress — they really will
 * count — which is the Nunes & Drèze effect the research cites.
 *
 * A stand-in for the ring the design system describes: same three states,
 * drawn with Views so it renders identically on web for screenshots.
 *
 * One line of words with it (D76, the voice pass, 2026-11-23; it was three:
 * "Your first answer: tomorrow evening" / "0 of 20 scored, 1 on its way" /
 * "20 more scored answers and your score unlocks."). Before the first answer,
 * above the bar: "Your first answer lands tomorrow evening. 20 answers unlock
 * your score." After it, below: "15 more scored answers unlock your score.",
 * with when the next one comes due. The bar draws what's scored and on its way.
 */
export function UnlockProgress({
  resolved,
  pending,
  total,
  nextDue,
  lead = null,
  estimate = null,
  firstLook = null,
  testID,
}: UnlockProgressProps) {
  const done = Math.min(resolved, total);
  const onTheWay = Math.min(pending, total - done);
  const toGo = total - done;

  // Before the first answer the owner's words (D76) say "answers"; after it,
  // the count is of scored ones, and says so.
  const unlocks = lead
    ? `${toGo} ${toGo === 1 ? 'answer unlocks' : 'answers unlock'} your score.`
    : `${toGo} more scored ${toGo === 1 ? 'answer unlocks' : 'answers unlock'} your score.`;
  const line = lead ? `${lead} ${unlocks}` : `${unlocks}${nextDue ? ` ${nextDue}` : ''}`;

  return (
    <View
      style={styles.wrap}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Calibrating. ${line}${firstLook ? ` ${firstLook}` : ''}${estimate ? ` ${estimate}` : ''}`}
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      <Text style={styles.title}>Calibrating</Text>
      {lead && (
        <Text style={styles.lead} testID={testID ? `${testID}-lead` : undefined}>
          {line}
        </Text>
      )}
      <View style={styles.bar}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i < done ? styles.done : i < done + onTheWay ? styles.onTheWay : styles.toGo,
            ]}
          />
        ))}
      </View>
      {!lead && (
        <Text style={styles.summary} testID={testID ? `${testID}-line` : undefined}>
          {line}
        </Text>
      )}
      {firstLook && (
        <Text style={styles.firstLook} testID={testID ? `${testID}-first-look` : undefined}>
          {firstLook}
        </Text>
      )}
      {estimate && (
        <Text style={styles.caption} testID={testID ? `${testID}-estimate` : undefined}>
          {estimate}
        </Text>
      )}
    </View>
  );
}

const SEGMENT_HEIGHT = 10;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: space.sm },
  title: { ...type.title3, color: colors.textPrimary },
  lead: { ...type.headline, color: colors.textPrimary },
  bar: { flexDirection: 'row', gap: 3 },
  segment: {
    borderRadius: radius.xs / 2,
    borderWidth: 1,
    flex: 1,
    height: SEGMENT_HEIGHT,
  },
  done: { backgroundColor: colors.action, borderColor: colors.action },
  onTheWay: {
    backgroundColor: colors.emphasis,
    borderColor: colors.action,
    borderStyle: 'dashed',
  },
  toGo: { backgroundColor: colors.surface, borderColor: colors.controlBorder },
  summary: { ...type.subhead, color: colors.textSecondary },
  caption: { ...type.footnote, color: colors.textTertiary },
  firstLook: { ...type.subhead, color: colors.textSecondary },
});

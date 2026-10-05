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
 */
export function UnlockProgress({ resolved, pending, total, nextDue, testID }: UnlockProgressProps) {
  const done = Math.min(resolved, total);
  const onTheWay = Math.min(pending, total - done);
  const toGo = total - done;

  const summary = [
    `${done} of ${total} resolved`,
    onTheWay > 0 ? `${onTheWay} on ${onTheWay === 1 ? 'its' : 'their'} way` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={styles.wrap}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Calibrating. ${summary}.`}
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      <Text style={styles.title}>Calibrating</Text>
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
      <Text style={styles.summary}>{summary}</Text>
      <Text style={styles.caption}>
        {toGo} more {toGo === 1 ? 'resolution' : 'resolutions'} and your score unlocks.
        {nextDue ? ` ${nextDue}` : ''}
      </Text>
    </View>
  );
}

const SEGMENT_HEIGHT = 10;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: space.sm },
  title: { ...type.title3, color: colors.textPrimary },
  bar: { flexDirection: 'row', gap: 3 },
  segment: {
    borderRadius: radius.xs / 2,
    borderWidth: 1,
    flex: 1,
    height: SEGMENT_HEIGHT,
  },
  done: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  onTheWay: {
    backgroundColor: colors.brand200,
    borderColor: colors.brand600,
    borderStyle: 'dashed',
  },
  toGo: { backgroundColor: colors.surface, borderColor: colors.controlBorder },
  summary: { ...type.subhead, color: colors.textSecondary },
  caption: { ...type.footnote, color: colors.textTertiary },
});

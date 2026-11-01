import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { colors, radius, space, tabularNums, type } from '@/constants/theme';
import type { Prediction } from '@/types';

import { isReadyToResolve } from './dueGroups';

/**
 * Where a row sits in its list (roadmap D33): rows share one grouped surface,
 * with hairlines between them, instead of each being its own card.
 */
export type RowPosition = 'single' | 'first' | 'middle' | 'last';

interface PredictionCardProps {
  prediction: Prediction;
  onPress?: (id: string) => void;
  /** Defaults to a row on its own. */
  position?: RowPosition;
  /**
   * False under a "Ready to resolve" header, which already says it: the row
   * doesn't repeat it ten times down the list.
   */
  showReady?: boolean;
}

/** The row's place in a list of `count`, from its `index`. */
export function rowPosition(index: number, count: number): RowPosition {
  if (count <= 1) return 'single';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

/**
 * "Fri, 3 Oct" in the user's locale, held together with no-break spaces so a
 * narrow row never strands the day on a line of its own ("Oct / 4").
 */
function formatDue(iso: string): string {
  return new Date(iso)
    .toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .replace(/ /g, '\u00A0');
}

/**
 * Status in words, all in one neutral ink (DESIGN_SYSTEM §7.11). No ✓/✗ —
 * those are the green/red idiom in disguise, and a No is an outcome, not a
 * mistake. A prediction whose day has come is "ready", never "overdue".
 */
function statusLabel(prediction: Prediction, now: Date): string {
  switch (prediction.status) {
    case 'resolved_yes':
      return 'Happened';
    case 'resolved_no':
      return "Didn't happen";
    case 'skipped':
      return 'Not scored';
    case 'pending':
      return isReadyToResolve(prediction, now) ? 'Ready to resolve' : 'Open';
  }
}

/**
 * One prediction as a row: the words, then the category and the date, with
 * the stated confidence in its own column on the right, as a number over a
 * small 0–100 scale (DESIGN_SYSTEM §7.11). The confidence is the record, so
 * it gets the column; the scale lets a list be read at a glance for where the
 * calls sit, the way the chart reads them.
 */
export function PredictionCard({
  prediction,
  onPress,
  position = 'single',
  showReady = true,
}: PredictionCardProps) {
  const due = formatDue(prediction.due_date);
  const status = statusLabel(prediction, new Date());
  // A resolved row dates itself by when it was answered, not when it was due.
  const answered = prediction.status !== 'pending' && prediction.resolved_at;
  const when = answered ? `resolved ${formatDue(answered)}` : `due ${due}`;
  // Outcome glyphs in neutral ink, filled vs hollow — never green/red
  // (DESIGN_SYSTEM §2.4). The word beside them carries the meaning.
  const glyph =
    prediction.status === 'resolved_yes'
      ? ({ sf: 'checkmark.circle.fill', ion: 'checkmark-circle' } as const)
      : prediction.status === 'resolved_no'
        ? ({ sf: 'xmark.circle', ion: 'close-circle-outline' } as const)
        : null;
  // Resolve asks "What surprised you?"; History is where the answer is read
  // back (roadmap step 31). Only on a resolved row, and only if written.
  const reflection =
    prediction.status !== 'pending' ? prediction.reflection?.trim() || null : null;
  // "Open" is the default state and the list's group header already says
  // when it's due; "Ready to resolve" is dropped under a header saying so.
  const showStatus = status !== 'Open' && (showReady || status !== 'Ready to resolve');
  const confidence = Math.max(0, Math.min(100, prediction.confidence));

  return (
    <Pressable
      testID={`prediction-card-${prediction.id}`}
      onPress={() => onPress?.(prediction.id)}
      accessibilityRole={onPress ? 'button' : undefined}
      // One sentence instead of fragments read in layout order.
      accessibilityLabel={
        `${prediction.title}. ${prediction.category}, ${prediction.confidence}% confident, ` +
        `${when}. ${status}.` +
        (reflection ? ` Your note: ${reflection}` : '')
      }
      style={({ pressed }) => [styles.row, edges[position], pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={3}>
          {prediction.title}
        </Text>
        {reflection && (
          <Text style={styles.reflection} numberOfLines={4} testID="prediction-card-reflection">
            “{reflection}”
          </Text>
        )}
        <View style={styles.metaRow}>
          <CategoryIcon category={prediction.category} size={13} color={colors.textSecondary} />
          <Text style={styles.meta}>
            <Text style={styles.category}>{prediction.category}</Text>, {when}
          </Text>
        </View>
        {showStatus && (
          <View style={styles.statusRow}>
            {glyph && (
              <Icon sf={glyph.sf} fallback={glyph.ion} size={15} color={colors.textPrimary} />
            )}
            <Text style={styles.status}>{status}</Text>
          </View>
        )}
      </View>
      {/* Read out in the row's label above; drawn for the eye. */}
      <View
        style={styles.confidence}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.percent}>{prediction.confidence}%</Text>
        <View style={styles.scale} testID="prediction-card-scale">
          <View style={styles.scaleTrack} />
          <View style={[styles.scaleMark, { left: `${confidence}%` }]} />
        </View>
      </View>
    </Pressable>
  );
}

const SCALE_WIDTH = 44;

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    columnGap: space.md,
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  main: { flex: 1, gap: space.xs, minWidth: 0 },
  title: { ...type.body, color: colors.textPrimary },
  // The user's own words, quoted and quieter than the prediction they're about.
  reflection: { ...type.footnote, color: colors.textSecondary, fontStyle: 'italic' },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  meta: { ...type.footnote, color: colors.textSecondary, flexShrink: 1 },
  category: { textTransform: 'capitalize' },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  status: { ...type.footnote, color: colors.textPrimary, fontWeight: '600' },
  confidence: { alignItems: 'flex-end', gap: 6, paddingTop: 2, width: SCALE_WIDTH },
  percent: { ...type.headline, ...tabularNums, color: colors.textPrimary },
  scale: { height: 10, width: SCALE_WIDTH },
  scaleTrack: {
    backgroundColor: colors.emphasis,
    borderRadius: 1,
    height: 2,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 4,
  },
  scaleMark: {
    backgroundColor: colors.textPrimary,
    borderRadius: 1,
    height: 10,
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
});

// Concentric with the group: the outer corners round, the joins stay square,
// and a hairline runs under every row but the last.
const edges = StyleSheet.create({
  single: {
    borderRadius: radius.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: space.sm,
  },
  first: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  middle: { borderBottomWidth: StyleSheet.hairlineWidth },
  last: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderBottomWidth: 1,
    marginBottom: space.sm,
  },
});

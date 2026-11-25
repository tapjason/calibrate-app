import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { dueDay, relativeDay } from '@/components/ui/dates';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { spokenExcerpt } from '@/components/ui/textLanguage';
import { colors, radius, space, tabularNums, type } from '@/constants/theme';
import type { Prediction } from '@/types';
import { categoryTitle, useCategoryStore } from '@/store/categoryStore';
import { answeredSameDay } from '@/store/statsStore';

import { isReadyToResolve } from './dueGroups';

/**
 * Where a row sits in its list (roadmap D33): rows share one grouped surface,
 * with hairlines between them, instead of each being its own card.
 */
export type RowPosition = 'single' | 'first' | 'middle' | 'last';

/** Above this text scale a title may take more lines (as ConfidenceControl's steppers wrap). */
const LARGE_TEXT_SCALE = 1.15;

interface PredictionCardProps {
  prediction: Prediction;
  onPress?: (id: string) => void;
  /** Defaults to a row on its own. */
  position?: RowPosition;
  /**
   * False under a "Ready to answer" header, which already says it: the row
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
 * Status in words, all in one neutral ink (DESIGN_SYSTEM §7.11). No ✓/✗ —
 * those are the green/red idiom in disguise, and a No is an outcome, not a
 * mistake. A prediction whose day has come is "ready", never "overdue".
 */
function statusLabel(prediction: Prediction, now: Date): string {
  switch (prediction.status) {
    // Answered the day it was logged (roadmap D41): the outcome stands, the
    // score leaves it out, and the row says so.
    case 'resolved_yes':
      return answeredSameDay(prediction) ? 'Happened, not scored' : 'Happened';
    case 'resolved_no':
      return answeredSameDay(prediction) ? "Didn't happen, not scored" : "Didn't happen";
    // Named, not only "Not scored", which is also a same-day answer's
    // (playtest 2026-11-04b, run 5, took it for one).
    case 'skipped':
      return "Can't tell, not scored";
    case 'pending':
      return isReadyToResolve(prediction, now) ? 'Ready to answer' : 'Open';
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
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const { fontScale } = useWindowDimensions();
  const now = new Date();
  const status = statusLabel(prediction, now);
  // A resolved row dates itself by when it was answered, not when it was due:
  // "due in 3 days", "answered yesterday", "due Nov 21 (Friday)" (the owner,
  // 2026-11-24), held together with no-break spaces so a narrow row never
  // strands a word on a line of its own. An open one due today says until
  // when: "due today by 11:59 PM" (D80).
  const answered = prediction.status !== 'pending' && prediction.resolved_at;
  const day = answered
    ? relativeDay(new Date(answered), now)
    : dueDay(new Date(prediction.due_date), now);
  const when = `${answered ? 'answered' : 'due'} ${day.text}`;
  const whenSpoken = `${answered ? 'answered' : 'due'} ${day.spoken}`;
  // Outcome glyphs in neutral ink, filled vs hollow — never green/red
  // (DESIGN_SYSTEM §2.4). The word beside them carries the meaning.
  const glyph =
    prediction.status === 'resolved_yes'
      ? ({ sf: 'checkmark.circle.fill', ion: 'checkmark-circle' } as const)
      : prediction.status === 'resolved_no'
        ? ({ sf: 'xmark.circle', ion: 'close-circle-outline' } as const)
        : null;
  const categoryName = categoryTitle(prediction.category);
  // Resolve asks "What surprised you?"; History is where the answer is read
  // back (roadmap step 31). Only on a resolved row, and only if written.
  const reflection =
    prediction.status !== 'pending' ? prediction.reflection?.trim() || null : null;
  // "Open" is the default state and the list's group header already says
  // when it's due; "Ready to answer" is dropped under a header saying so.
  const showStatus = status !== 'Open' && (showReady || status !== 'Ready to answer');
  const confidence = Math.max(0, Math.min(100, prediction.confidence));

  return (
    <Pressable
      testID={`prediction-card-${prediction.id}`}
      onPress={() => onPress?.(prediction.id)}
      accessibilityRole={onPress ? 'button' : undefined}
      // One sentence instead of fragments read in layout order.
      accessibilityLabel={
        `${prediction.title}. ${categoryName}, ${prediction.confidence}% confident, ` +
        `${whenSpoken}. ${status}.` +
        // The start of the note, not all of it: a long one made the row's
        // label about 1,000 characters (playtest 2026-11-08, finding 40). The
        // details read it in full.
        (reflection ? ` Your note: ${spokenExcerpt(reflection)}` : '')
      }
      style={({ pressed }) => [styles.row, edges[position], pressed && styles.pressed]}
    >
      <View style={styles.main}>
        {/* Three lines, more at a larger text size, where the same title
            takes more lines: at 135% a 53-character one lost its last word,
            the day it was due (blind playtest 2026-11-04, third round). */}
        <Text
          style={styles.title}
          numberOfLines={fontScale > LARGE_TEXT_SCALE ? 6 : 3}
          testID="prediction-card-title"
        >
          {prediction.title}
        </Text>
        {/* Three lines and an ellipsis in a list: at four a long note still
            made a row about 200 px tall mid-list (blind playtest 2026-11-12,
            finding 20). The details sheet shows it whole. */}
        {reflection && (
          <Text style={styles.reflection} numberOfLines={3} testID="prediction-card-reflection">
            “{reflection}”
          </Text>
        )}
        <View style={styles.metaRow}>
          {/* The name keeps to one line beside its icon, ending in "…" when
              it's long: a 24-character name ran past the card's edge
              (playtest 2026-11-08, finding 1). When name and date don't fit
              together, the date moves under them, so neither is lost; icon
              and name stay together as one item. */}
          <View style={styles.metaName}>
            <CategoryIcon category={prediction.category} size={13} color={colors.textSecondary} />
            {/* No comma (D62): when the date moved under the name, "Weather,"
                ended its line on it (blind playtest 2026-11-13d, run 7). The
                spoken label keeps it. */}
            <Text style={styles.meta} numberOfLines={1} testID="prediction-card-category">
              {categoryName}
            </Text>
          </View>
          <Text style={styles.meta}>{when}</Text>
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
        <View style={styles.scale} testID={`confidence-scale-${prediction.id}`}>
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
    flexWrap: 'wrap',
    rowGap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  // At large sizes the confidence column drops below the words instead of
  // squeezing them to a few letters a line (playtest 2026-11-03, run 3).
  main: { flexBasis: 140, flexGrow: 1, flexShrink: 1, gap: space.xs, minWidth: 0 },
  title: { ...type.body, color: colors.textPrimary },
  // The user's own words, quoted and quieter than the prediction they're about.
  reflection: { ...type.footnote, color: colors.textSecondary, fontStyle: 'italic' },
  metaRow: {
    alignItems: 'center',
    columnGap: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 0,
  },
  metaName: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: space.xs,
    minWidth: 0,
  },
  meta: { ...type.footnote, color: colors.textSecondary, flexShrink: 1 },
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

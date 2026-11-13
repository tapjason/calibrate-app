import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { localCount } from '@/components/ui/count';
import { colors, radius, space, type } from '@/constants/theme';
import type { BucketStat } from '@/types';

interface CoverageRowProps {
  buckets: readonly BucketStat[];
  /**
   * Opens the predictions behind a range (roadmap step 51), by its lower
   * edge. Without it the cells are plain counts, as on the Warmup.
   */
  onSelectRange?: (low: number) => void;
}

const EDGES = [0, 20, 40, 60, 80] as const;

/**
 * Which confidence ranges the score actually covers (DESIGN_SYSTEM §7.2 item
 * 4). Most people only log things they expect to happen, which leaves the low
 * buckets empty and the score measuring half the range — CLAUDE.md's range
 * coverage caveat, made visible.
 *
 * Empty ranges get a dashed outline and the word "none", so the gap reads
 * without colour.
 */
export function CoverageRow({ buckets, onSelectRange }: CoverageRowProps) {
  const byLow = new Map(buckets.map((b) => [b.low, b.total_resolved]));
  const lowUsed = (byLow.get(0) ?? 0) + (byLow.get(20) ?? 0) > 0;
  // Each cell is at least as wide as its biggest count at this text size;
  // when five don't fit across, the row wraps instead of one count running
  // into the next ("277300" at large text; playtest 2026-11-08b, finding 16).
  const { fontScale } = useWindowDimensions();
  const widest = Math.max(0, ...EDGES.map((low) => localCount(byLow.get(low) ?? 0).length));
  const cellFloor = coverageCellFloor(widest, fontScale);

  return (
    <View style={styles.wrap} testID="coverage-row">
      <View style={styles.row}>
        {EDGES.map((low) => {
          const n = byLow.get(low) ?? 0;
          const label = `${low}–${low + 20}%`;
          const content = (
            <>
              {/* The narrowest range label in the app. One line while it fits;
                  past that it breaks after its dash ("80–" over "100%"), the
                  one place a range may (DESIGN_SYSTEM §7.9): held whole, it
                  was cut to "20–4…" at large text sizes, where the web can't
                  shrink it and iOS only so far (blind playtest 2026-11-01).
                  Three lines, so a cell too narrow even for "100%" breaks it
                  rather than cutting it to "80–10…" (playtest 2026-11-08).
                  Spoken plain, from the cell's label. */}
              <Text
                style={styles.range}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                testID={`coverage-${low}-label`}
              >
                {label}
              </Text>
              <Text style={[styles.count, n === 0 && styles.countEmpty]} numberOfLines={1}>
                {n === 0 ? 'none' : localCount(n)}
              </Text>
            </>
          );
          // An empty range has nothing behind it to open.
          if (onSelectRange && n > 0) {
            return (
              <Pressable
                key={low}
                testID={`coverage-${low}`}
                onPress={() => onSelectRange(low)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${n} scored. Show them.`}
                style={({ pressed }) => [
                  styles.cell,
                  { flexBasis: cellFloor },
                  styles.cellTappable,
                  pressed && styles.cellPressed,
                ]}
              >
                {content}
              </Pressable>
            );
          }
          return (
            <View
              key={low}
              testID={`coverage-${low}`}
              style={[styles.cell, { flexBasis: cellFloor }, n === 0 && styles.empty]}
              accessible
              accessibilityLabel={`${label}: ${n === 0 ? 'none yet' : `${n} scored`}`}
            >
              {content}
            </View>
          );
        })}
      </View>
      {onSelectRange && buckets.length > 0 && (
        <Text style={styles.note} testID="coverage-tap-hint">
          Tap a range to see the predictions behind it.
        </Text>
      )}
      {buckets.length > 0 && !lowUsed && (
        <Text style={styles.note} testID="coverage-note">
          {/* "Scored", not "logged": it counts answers, and a 30% call logged a
              minute earlier read as lost (blind playtest 2026-11-13, runs 3 and 5). */}
          None of your scored answers is from a call under 40% yet, so your score only
          covers the confident half of your range.
        </Text>
      )}
    </View>
  );
}

/**
 * A range cell's least width: its count at headline size (about 10.5pt a
 * digit, and "none" as four), plus the cell's own padding, scaled with the
 * text. Exported for tests.
 */
export function coverageCellFloor(digits: number, fontScale: number): number {
  return Math.ceil(Math.max(digits * 10.5, 30) * Math.max(fontScale, 1) + 8);
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 2,
    // A label broken over two lines makes its cell, and so the row, taller:
    // the counts keep to the bottom edge, in line across the row.
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  // A tappable range takes the control outline, the 3:1 border the app's
  // other controls use, so it reads as one; empty ranges keep their dashes.
  cellTappable: { borderColor: colors.controlBorder },
  cellPressed: { backgroundColor: colors.surfaceSunken },
  empty: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.controlBorder,
    borderStyle: 'dashed',
  },
  // 11pt, the floor (DESIGN_SYSTEM §0 rule 7): in Inter, "80–100%" at 12pt
  // didn't fit a 320pt screen's ~51pt cell, and web can't shrink it to fit.
  range: {
    ...type.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  count: { ...type.headline, color: colors.textPrimary },
  countEmpty: { ...type.footnote, color: colors.textTertiary },
  note: { ...type.footnote, color: colors.textSecondary },
});

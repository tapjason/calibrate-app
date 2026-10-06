import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LensEmblem } from '@/components/ui/LensEmblem';
import { APP_NAME } from '@/constants/app';
import { WRAPPED_DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import { CARD_MAX_SCALE, roundedFamily } from '@/constants/theme';
import type { WrappedSummary } from '@/engine/wrapped';

import type { BadgeProgress } from './nextBadgeCopy';
import { wrappedCardSummary, wrappedStory, type OverallProgress } from './wrappedCopy';

interface WrappedCardProps {
  summary: WrappedSummary;
  /** All-time progress, so a provisional week can point at the real unlock. */
  overall?: OverallProgress | null;
  /** Open predictions due within the week, for an empty week (roadmap step 34). */
  upcoming?: number;
  /** The badge closest to hand, from nextBadgeProgress(); null hides the row. */
  badge?: BadgeProgress | null;
  /** Cosmetic only (Plus); the free theme is the default. */
  theme?: CardTheme;
  /**
   * Put prediction titles on the card. Off by default: a card leaves the
   * phone, and "Surest thing that didn't" names something the user may not
   * want in a group chat (DESIGN_SYSTEM §7.5, show/hide before sharing).
   */
  showTitles?: boolean;
}

/**
 * The Calibration Wrapped card — the weekly/yearly recap, shaped to be shared.
 *
 * Same construction as IdentityCard: plain Views so view-shot rasterizes
 * exactly what is on screen, and a fixed "get your own" footer, because
 * Wrapped is free forever and is doing marketing work.
 *
 * When the window is provisional the card shows the counts, a receipt from the
 * busiest bucket, and the user's progress toward a real score — never a
 * verdict built on four resolutions.
 */
export const WrappedCard = forwardRef<View, WrappedCardProps>(function WrappedCard(
  { summary, overall, upcoming = 0, badge, theme = WRAPPED_DEFAULT_THEME, showTitles = false },
  ref,
) {
  const story = wrappedStory(summary, overall, upcoming);

  return (
    <View
      ref={ref}
      // One element for a screen reader, in words (roadmap step 45).
      accessible
      accessibilityRole="image"
      accessibilityLabel={wrappedCardSummary(story)}
      style={[styles.card, { backgroundColor: theme.background }]}
      testID="wrapped-card"
      collapsable={false}
    >
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.eyebrow, { color: theme.accent }]}
      >
        {story.title}
      </Text>
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.stat, { color: theme.foreground }]}
        accessibilityLabel={story.stat}
        testID="wrapped-stat"
      >
        {story.statCount}
      </Text>
      {story.statRate && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.statRate, { color: theme.foreground }]}
          testID="wrapped-expected"
        >
          {story.statRate}
        </Text>
      )}

      {story.receipt && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.verdict, { color: theme.foreground }]}
          testID="wrapped-receipt"
        >
          {story.receipt}
        </Text>
      )}
      {story.verdict && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.verdict, { color: theme.muted }]}
          testID="wrapped-verdict"
        >
          {story.verdict}
        </Text>
      )}
      {story.provisionalNote && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.provisional, { color: theme.accent }]}
          testID="wrapped-provisional"
        >
          {story.provisionalNote}
        </Text>
      )}

      {badge && (
        <View style={styles.badgeRow} testID="wrapped-next-badge">
          <LensEmblem
            tier={badge.badge}
            size={44}
            progress={badge.progress}
            inkColor={theme.accent}
            progressColor={theme.foreground}
          />
          <Text
            maxFontSizeMultiplier={CARD_MAX_SCALE}
            style={[styles.badgeText, { color: theme.foreground }]}
          >
            {badge.text}
          </Text>
        </View>
      )}

      {summary.categories.length > 0 && (
        <View style={styles.badges}>
          {summary.categories.map((c) => (
            <View
              key={c.category}
              testID={`wrapped-category-${c.category}`}
              style={[styles.chip, { borderColor: theme.divider }]}
            >
              <Text
                maxFontSizeMultiplier={CARD_MAX_SCALE}
                style={[styles.chipLabel, { color: theme.foreground }]}
              >
                {c.category}
              </Text>
              <Text
                maxFontSizeMultiplier={CARD_MAX_SCALE}
                style={[styles.chipCount, { color: theme.muted }]}
              >
                {c.resolved}
              </Text>
            </View>
          ))}
        </View>
      )}

      {summary.boldest_hit && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.line, { color: theme.muted }]}
          testID="wrapped-boldest-hit"
        >
          Boldest call that landed · {summary.boldest_hit.confidence}%
          {showTitles ? ` · ${summary.boldest_hit.title}` : ''}
        </Text>
      )}
      {summary.biggest_miss && (
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.line, { color: theme.muted }]}
          testID="wrapped-biggest-miss"
        >
          Surest thing that didn&apos;t · {summary.biggest_miss.confidence}%
          {showTitles ? ` · ${summary.biggest_miss.title}` : ''}
        </Text>
      )}

      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.note, { color: theme.muted }]}
      >
        {story.note}
      </Text>

      <View style={[styles.footer, { borderTopColor: theme.divider }]}>
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.footerMark, { color: theme.foreground }]}
        >
          {APP_NAME}
        </Text>
        {/* The growth hook, as a question: never the faintest line on the card. */}
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.footerHook, { color: theme.accent }]}
        >
          What are you sharp at?
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 8,
    padding: 24,
  },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  stat: { fontFamily: roundedFamily, fontSize: 34, fontWeight: '800', lineHeight: 40 },
  statRate: { fontSize: 20, fontWeight: '700', lineHeight: 26, marginBottom: 4 },
  verdict: { fontSize: 15, lineHeight: 21 },
  provisional: { fontSize: 14, lineHeight: 20 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  chipCount: { fontSize: 12, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 19 },
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 4 },
  badgeText: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  footer: {
    borderTopWidth: 1,
    gap: 2,
    marginTop: 12,
    paddingTop: 14,
  },
  footerMark: { fontSize: 15, fontWeight: '700' },
  footerHook: { fontSize: 14, fontWeight: '600' },
});

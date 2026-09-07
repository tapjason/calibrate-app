import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { BADGE_META } from '@/constants/badges';
import { WRAPPED_DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import type { WrappedSummary } from '@/engine/wrapped';

import { wrappedStory } from './wrappedCopy';

interface WrappedCardProps {
  summary: WrappedSummary;
  /** Cosmetic only (Plus); the free theme is the default. */
  theme?: CardTheme;
}

/**
 * The Calibration Wrapped card — the weekly/yearly recap, shaped to be shared.
 *
 * Same construction as IdentityCard: plain Views so view-shot rasterizes
 * exactly what is on screen, and a fixed "get your own" footer, because
 * Wrapped is free forever and is doing marketing work.
 *
 * When the window is provisional the card shows the counts and a line about
 * what it would take to earn a calibration read — never a verdict built on
 * four resolutions.
 */
export const WrappedCard = forwardRef<View, WrappedCardProps>(
  function WrappedCard({ summary, theme = WRAPPED_DEFAULT_THEME }, ref) {
    const story = wrappedStory(summary);

    return (
      <View
        ref={ref}
        style={[styles.card, { backgroundColor: theme.background }]}
        testID="wrapped-card"
        collapsable={false}
      >
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{story.title}</Text>
        <Text style={[styles.stat, { color: theme.foreground }]}>{story.stat}</Text>

        {story.verdict && (
          <Text
            style={[styles.verdict, { color: theme.muted }]}
            testID="wrapped-verdict"
          >
            {story.verdict}
          </Text>
        )}
        {story.provisionalNote && (
          <Text
            style={[styles.provisional, { color: theme.accent }]}
            testID="wrapped-provisional"
          >
            {story.provisionalNote}
          </Text>
        )}

        {summary.categories.length > 0 && (
          <View style={styles.badges}>
            {summary.categories.map((c) => {
              const meta = BADGE_META.tracker;
              return (
                <View
                  key={c.category}
                  testID={`wrapped-category-${c.category}`}
                  style={[styles.chip, { backgroundColor: meta.background }]}
                >
                  <Text style={[styles.chipLabel, { color: meta.color }]}>
                    {c.category}
                  </Text>
                  <Text style={styles.chipCount}>{c.resolved}</Text>
                </View>
              );
            })}
          </View>
        )}

        {summary.boldest_hit && (
          <Text
            style={[styles.line, { color: theme.muted }]}
            testID="wrapped-boldest-hit"
          >
            Boldest call that landed · {summary.boldest_hit.confidence}% ·{' '}
            {summary.boldest_hit.title}
          </Text>
        )}
        {summary.biggest_miss && (
          <Text
            style={[styles.line, { color: theme.muted }]}
            testID="wrapped-biggest-miss"
          >
            Surest thing that didn&apos;t · {summary.biggest_miss.confidence}% ·{' '}
            {summary.biggest_miss.title}
          </Text>
        )}

        <Text style={[styles.note, { color: theme.muted }]}>{story.note}</Text>

        <View style={[styles.footer, { borderTopColor: theme.divider }]}>
          <Text style={[styles.footerMark, { color: theme.foreground }]}>
            {APP_NAME}
          </Text>
          <Text style={[styles.footerHook, { color: theme.accent }]}>
            Find out where your judgment holds up
          </Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 8,
    padding: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stat: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  verdict: { fontSize: 15, lineHeight: 21 },
  provisional: { fontSize: 14, lineHeight: 20 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  chipCount: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  footer: {
    borderTopWidth: 1,
    gap: 2,
    marginTop: 12,
    paddingTop: 14,
  },
  footerMark: { fontSize: 14, fontWeight: '700' },
  footerHook: { fontSize: 12 },
});

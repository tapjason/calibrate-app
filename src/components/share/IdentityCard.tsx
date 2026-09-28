import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BADGE_META } from '@/constants/badges';
import { APP_NAME } from '@/constants/app';
import { DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import type { ShareCard } from '@/types';

import { shareHeadline, shareSubline } from './cardCopy';

interface IdentityCardProps {
  card: ShareCard;
  /**
   * Cosmetic only (Plus). Defaults to the free theme, so this card renders and
   * exports identically whether or not anyone has paid — the artifact is never
   * gated, only its palette.
   */
  theme?: CardTheme;
}

/**
 * The category identity card — the app's core shareable artifact.
 *
 * Built from plain Views rather than SVG: react-native-view-shot rasterizes
 * the native view tree, so what the user sees on screen is exactly what lands
 * in the PNG, with no second rendering path to keep in sync.
 *
 * Fixed aspect and generous padding because this is screenshot-native: it has
 * to stay legible as a thumbnail in a chat thread. The "get your own" footer
 * is the growth hook and is never removed — this card is free forever, and it
 * is the marketing budget.
 *
 * Forwards a ref so the screen can hand the whole card to captureCard().
 */
export const IdentityCard = forwardRef<View, IdentityCardProps>(
  function IdentityCard({ card, theme = DEFAULT_THEME }, ref) {
    return (
      <View
        ref={ref}
        style={[styles.card, { backgroundColor: theme.background }]}
        testID="identity-card"
        collapsable={false}
      >
        <Text style={[styles.eyebrow, { color: theme.accent }]}>My calibration</Text>

        <Text style={[styles.headline, { color: theme.foreground }]}>
          {shareHeadline(card)}
        </Text>
        <Text style={[styles.subline, { color: theme.muted }]}>
          {shareSubline(card)}
        </Text>

        <View style={styles.badges}>
          {card.categories.map((c) => {
            const meta = BADGE_META[c.badge_level];
            return (
              <View
                key={c.category}
                testID={`card-badge-${c.category}`}
                style={[styles.chip, { backgroundColor: meta.background }]}
              >
                <Text style={styles.chipEmoji}>{meta.emoji}</Text>
                <Text style={[styles.chipLabel, { color: meta.color }]}>
                  {c.category}
                </Text>
              </View>
            );
          })}
        </View>

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
    gap: 10,
    padding: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headline: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  subline: { fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  footer: {
    borderTopWidth: 1,
    gap: 2,
    marginTop: 14,
    paddingTop: 14,
  },
  footerMark: { fontSize: 14, fontWeight: '700' },
  // The growth hook: never the faintest line on the card (accent is ≥ 4.5:1).
  footerHook: { fontSize: 13, fontWeight: '600' },
});

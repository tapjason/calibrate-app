import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import { CARD_MAX_SCALE, FONT_FAMILY } from '@/constants/theme';

import type { WarmupCardCopy } from './warmupCardCopy';

interface WarmupCardProps {
  copy: WarmupCardCopy;
  /** Cosmetic only (Plus); the free theme is the default. */
  theme?: CardTheme;
}

/**
 * The Day-0 card: the Warmup verdict, shareable before any real prediction
 * has resolved, so the Share screen is never empty (DESIGN_SYSTEM rule 0.10).
 *
 * Same construction as IdentityCard — plain Views, so view-shot rasterises
 * exactly what is on screen — and the same fixed "get your own" footer, which
 * is the growth hook and is never removed.
 */
export const WarmupCard = forwardRef<View, WarmupCardProps>(function WarmupCard(
  { copy, theme = DEFAULT_THEME },
  ref,
) {
  return (
    <View
      ref={ref}
      // One element for a screen reader, in words (roadmap step 45).
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Share card. ${copy.eyebrow}: ${copy.headline}. ${copy.receipt}. ${copy.context}`}
      style={[styles.card, { backgroundColor: theme.background }]}
      testID="warmup-card"
      collapsable={false}
    >
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.eyebrow, { color: theme.accent }]}
      >
        {copy.eyebrow}
      </Text>
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.headline, { color: theme.foreground }]}
      >
        {copy.headline}
      </Text>
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.receipt, { color: theme.foreground }]}
      >
        {copy.receipt}
      </Text>
      <Text
        maxFontSizeMultiplier={CARD_MAX_SCALE}
        style={[styles.context, { color: theme.muted }]}
      >
        {copy.context}
      </Text>

      <View style={[styles.footer, { borderTopColor: theme.divider }]}>
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.footerMark, { color: theme.foreground }]}
        >
          {APP_NAME}
        </Text>
        {/* The growth hook: never the faintest line on the card. */}
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.footerHook, { color: theme.accent }]}
        >
          How well do you know what you know?
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 20, gap: 8, padding: 24 },
  eyebrow: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  headline: {
    fontFamily: FONT_FAMILY,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 46,
    marginTop: 4,
  },
  receipt: { fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  context: { fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 20 },
  footer: { borderTopWidth: 1, gap: 2, marginTop: 16, paddingTop: 14 },
  footerMark: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '700' },
  footerHook: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '600' },
});

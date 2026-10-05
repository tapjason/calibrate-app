import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LensEmblem } from '@/components/ui/LensEmblem';
import { APP_NAME } from '@/constants/app';
import { DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import { contrastRatio } from '@/constants/contrast';
import { CARD_MAX_SCALE, palettes, roundedFamily } from '@/constants/theme';
import type { BucketStat, Direction, ShareCard } from '@/types';

import { identityCardSummary, shareLines, shareSubline } from './cardCopy';

interface IdentityCardProps {
  card: ShareCard;
  /**
   * Cosmetic only (Plus). Defaults to the free theme, so this card renders and
   * exports identically whether or not anyone has paid — the artifact is never
   * gated, only its palette.
   */
  theme?: CardTheme;
  /**
   * The user's calibration buckets, for the mini dot strip. Drawn only when
   * the card carries a rating — a strip of verdicts on a provisional record
   * would be publishing noise.
   */
  buckets?: readonly BucketStat[];
  /**
   * Export shape (DESIGN_SYSTEM §7.5): 'post' is 3:4, the tallest ratio X and
   * iMessage show uncropped; 'story' is 9:16 for Instagram/Snapchat stories.
   * Undefined keeps the compact in-app card.
   */
  format?: CardFormat;
}

export type CardFormat = 'post' | 'story';

const ASPECT: Record<CardFormat, number> = { post: 3 / 4, story: 9 / 16 };

const BAND_LOWS = [0, 20, 40, 60, 80] as const;

/** Dot colours for the card's own background: light marks on light, dark on dark. */
function marksFor(background: string): Record<Direction, string> {
  const onDark = contrastRatio(background, '#FFFFFF') > 4.5;
  const p = onDark ? palettes.dark : palettes.light;
  return {
    overconfident: p.overMark,
    underconfident: p.underMark,
    calibrated: p.calibratedMark,
  };
}

/**
 * The category identity card — the app's core shareable artifact.
 *
 * Hierarchy (DESIGN_SYSTEM §7.5), built to read as a thumbnail in a chat
 * thread: the identity line large ("Sharp in health"), the contrast line
 * beneath it ("Guesser in finance"), one receipt, a five-dot strip with no
 * axes, then the badges and a footer hook phrased as a question.
 *
 * Plain Views (and the SVG emblems) so react-native-view-shot rasterises
 * exactly what is on screen. The footer is the growth hook and is never
 * removed — this card is free forever.
 */
export const IdentityCard = forwardRef<View, IdentityCardProps>(function IdentityCard(
  { card, theme = DEFAULT_THEME, buckets = [], format },
  ref,
) {
  const { identity, contrast } = shareLines(card);
  const showStrip = card.rating !== null && buckets.length > 0;
  const marks = marksFor(theme.background);
  const byLow = new Map(buckets.map((b) => [b.low, b]));
  const maxN = buckets.reduce((m, b) => Math.max(m, b.total_resolved), 1);

  return (
    <View
      ref={ref}
      // One element for a screen reader, in words (roadmap step 45).
      accessible
      accessibilityRole="image"
      accessibilityLabel={identityCardSummary(card)}
      style={[
        styles.card,
        { backgroundColor: theme.background },
        format && { aspectRatio: ASPECT[format] },
        // Stories keep content inside the middle band so app chrome at the top
        // and the reply bar at the bottom don't cover it.
        format === 'story' && styles.story,
      ]}
      testID="identity-card"
      collapsable={false}
    >
      {/* The shaped formats centre the story and give the best tier's emblem
          the room a tall card has; the compact in-app card stays tight. */}
      <View style={format ? styles.body : styles.bodyCompact}>
        {format && card.categories[0] && (
          <View style={styles.hero} testID="card-hero-emblem">
            <LensEmblem
              tier={card.categories[0].badge_level}
              size={format === 'story' ? 112 : 88}
            />
          </View>
        )}
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.eyebrow, { color: theme.accent }]}
        >
          My calibration
        </Text>

        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.identity, { color: theme.foreground }]}
          testID="card-identity"
        >
          {identity}
        </Text>
        {contrast && (
          <Text
            maxFontSizeMultiplier={CARD_MAX_SCALE}
            style={[styles.contrast, { color: theme.muted }]}
            testID="card-contrast"
          >
            {contrast}
          </Text>
        )}

        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.receipt, { color: theme.foreground }]}
        >
          {shareSubline(card)}
        </Text>

        {showStrip && (
          <View style={styles.strip} testID="card-strip">
            {BAND_LOWS.map((low) => {
              const b = byLow.get(low);
              const size = b ? 10 + (b.total_resolved / maxN) * 12 : 8;
              return (
                <View key={low} style={styles.stripCell}>
                  <View
                    style={[
                      { width: size, height: size, borderRadius: size / 2 },
                      b
                        ? { backgroundColor: marks[b.direction] }
                        : { borderColor: theme.divider, borderWidth: 1.5 },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.badges}>
          {card.categories.map((c) => (
            <View
              key={c.category}
              testID={`card-badge-${c.category}`}
              style={[styles.chip, { borderColor: theme.divider }]}
            >
              <LensEmblem tier={c.badge_level} size={18} />
              <Text
                maxFontSizeMultiplier={CARD_MAX_SCALE}
                style={[styles.chipLabel, { color: theme.foreground }]}
              >
                {c.category}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.footer,
          { borderTopColor: theme.divider },
          format && styles.footerPinned,
        ]}
      >
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
  card: { borderRadius: 24, padding: 24 },
  body: { flex: 1, gap: 8, justifyContent: 'center' },
  bodyCompact: { gap: 8 },
  hero: { marginBottom: 12 },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  identity: {
    fontFamily: roundedFamily,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    marginTop: 4,
  },
  contrast: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  receipt: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  strip: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    marginTop: 4,
  },
  stripCell: { alignItems: 'center', flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
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
  footer: { borderTopWidth: 1, gap: 2, marginTop: 14, paddingTop: 14 },
  footerPinned: { marginTop: 'auto' },
  story: { paddingVertical: 56 },
  footerMark: { fontSize: 15, fontWeight: '700' },
  footerHook: { fontSize: 14, fontWeight: '600' },
});

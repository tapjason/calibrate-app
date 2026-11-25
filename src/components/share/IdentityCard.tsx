import { forwardRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { LensEmblem } from '@/components/ui/LensEmblem';
import { APP_NAME } from '@/constants/app';
import { DEFAULT_THEME, type CardTheme } from '@/constants/cardThemes';
import { CARD_MAX_SCALE, FONT_FAMILY, paletteOn } from '@/constants/theme';
import { MIN_N_BAND, type BucketStat, type Direction, type ShareCard } from '@/types';
import { categoryTitle } from '@/store/categoryStore';

import {
  hiddenLine,
  identityCardSummary,
  shareLines,
  shareSubline,
  showsRanges,
  STRIP_KEY,
} from './cardCopy';
import { CARD_CANVAS_WIDTH, CARD_RADIUS } from './ScaledCanvas';

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

/**
 * The shaped card is laid out on one fixed canvas on every phone (roadmap
 * step 53): 360 × 480 for a Post (3:4) and 360 × 640 for a Story (9:16),
 * exported at 3× as 1080 × 1440 and 1080 × 1920, the sizes DESIGN_SYSTEM
 * §7.5 is written for. It used to take the screen's width, so on a 375pt
 * phone the same content overflowed its 3:4 box: the emblem rose over the
 * Shape control and the badges ran into the footer, in the preview and the
 * exported PNG alike. The preview scales the canvas to fit instead
 * (ScaledCanvas), so what you see is what is sent.
 */
export const CARD_CANVAS_HEIGHT: Record<CardFormat, number> = { post: 480, story: 640 };

/** How far to shrink content that is taller than the room it has, or 1. */
export function fitScale(room: number, content: number): number {
  if (room <= 0 || content <= room) return 1;
  return room / content;
}

const BAND_LOWS = [0, 20, 40, 60, 80] as const;

/** Dot colours for the card's own background: light marks on light, dark on dark. */
function marksFor(background: string): Record<Direction, string> {
  const p = paletteOn(background);
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
 * thread: the identity line large ("Gold in health"), the contrast line
 * beneath it ("Bronze in finance"), one receipt, a five-range strip from 0%
 * to 100% whose marks say each range's lean by shape and colour (D47),
 * then the badges and a footer hook, "Learn when to trust your gut" (D80).
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
  const hidden = hiddenLine(card);
  // Not until some range has 10 answers (roadmap D58): all grey says nothing.
  const showStrip = showsRanges(card, buckets);
  // A long identity line, five badges and a larger text size can still be
  // taller than the canvas. Then the content shrinks as one piece to fit,
  // rather than spilling into the footer.
  const [room, setRoom] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const fit = format ? fitScale(room, contentHeight) : 1;
  const onRoom = (e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.height);
  const onContent = (e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height);
  const marks = marksFor(theme.background);
  // Emblems take the palette that reads on this card, fixed so the PNG looks
  // the same from a dark-mode phone (D7).
  const emblemPalette = paletteOn(theme.background);
  const byLow = new Map(buckets.map((b) => [b.low, b]));
  const maxN = buckets.reduce((m, b) => Math.max(m, b.total_resolved), 1);

  return (
    <View
      ref={ref}
      // One element for a screen reader, in words (roadmap step 45).
      accessible
      accessibilityRole="image"
      accessibilityLabel={identityCardSummary(card, showStrip ? buckets : [])}
      style={[
        styles.card,
        { backgroundColor: theme.background },
        format && { width: CARD_CANVAS_WIDTH, height: CARD_CANVAS_HEIGHT[format] },
        // Stories keep content inside the middle band so app chrome at the top
        // and the reply bar at the bottom don't cover it.
        format === 'story' && styles.story,
      ]}
      testID="identity-card"
      collapsable={false}
    >
      {/* The shaped formats centre the story and give the best tier's emblem
          the room a tall card has; the compact in-app card stays tight. */}
      <View
        style={format ? styles.body : styles.bodyCompact}
        onLayout={format ? onRoom : undefined}
        testID="card-body"
      >
        <View
          style={[styles.content, fit < 1 && { transform: [{ scale: fit }] }]}
          onLayout={format ? onContent : undefined}
          testID="card-content"
        >
          {format && card.categories[0] && (
            <View style={styles.hero} testID="card-hero-emblem">
              <LensEmblem
                tier={card.categories[0].badge_level}
                size={format === 'story' ? 112 : 88}
                palette={emblemPalette}
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
            // Labelled and not colour-only (roadmap D47): the row's ends say
            // it runs from how unsure to how sure, and each range's shape
            // says which way it went, as its colour does: a ring on the line,
            // ▲ came true more often than said, ▼ less often. An empty range
            // is a dash, so it can't pass for the ring, and one under 10
            // answers a small grey dot (D58).
            <View style={styles.strip} testID="card-strip">
              <Text
                maxFontSizeMultiplier={CARD_MAX_SCALE}
                style={[styles.stripEnd, { color: theme.foreground }]}
              >
                0%
              </Text>
              {BAND_LOWS.map((low) => {
                const b = byLow.get(low);
                const size = b ? 10 + (b.total_resolved / maxN) * 12 : 8;
                // Under 10 answers a range shows no lean, by shape or colour
                // (roadmap D58): a small grey dot, there but not read yet.
                const thin = b !== undefined && b.total_resolved < MIN_N_BAND;
                return (
                  <View
                    key={low}
                    style={styles.stripCell}
                    testID={`card-strip-${low}-${!b ? 'empty' : thin ? 'thin' : b.direction}`}
                  >
                    {!b ? (
                      <View style={[styles.stripEmpty, { backgroundColor: theme.muted }]} />
                    ) : thin ? (
                      <View style={[styles.stripThin, { backgroundColor: theme.muted }]} />
                    ) : b.direction === 'calibrated' ? (
                      <View
                        style={{
                          width: size,
                          height: size,
                          borderRadius: size / 2,
                          borderWidth: 2.5,
                          borderColor: marks.calibrated,
                        }}
                      />
                    ) : (
                      <Svg width={size + 2} height={size + 2}>
                        <Polygon
                          points={
                            b.direction === 'underconfident'
                              ? `${(size + 2) / 2},1 ${size + 1},${size + 1} 1,${size + 1}`
                              : `1,1 ${size + 1},1 ${(size + 2) / 2},${size + 1}`
                          }
                          fill={marks[b.direction]}
                        />
                      </Svg>
                    )}
                  </View>
                );
              })}
              <Text
                maxFontSizeMultiplier={CARD_MAX_SCALE}
                style={[styles.stripEnd, { color: theme.foreground }]}
              >
                100%
              </Text>
            </View>
          )}
          {showStrip && (
            // What the marks mean, in the strip's own words (step 173): Sam,
            // colour blind, decoded ▼ only because the chart had told him
            // (blind playtest 2026-11-12f, finding 4).
            <Text
              maxFontSizeMultiplier={CARD_MAX_SCALE}
              style={[styles.stripKey, { color: theme.foreground }]}
              testID="card-strip-key"
            >
              {STRIP_KEY}
            </Text>
          )}

          <View style={styles.badges}>
            {card.categories.map((c) => (
              <View
                key={c.category}
                testID={`card-badge-${c.category}`}
                style={[styles.chip, { borderColor: theme.divider }]}
              >
                <LensEmblem tier={c.badge_level} size={18} palette={emblemPalette} />
                <Text
                  maxFontSizeMultiplier={CARD_MAX_SCALE}
                  style={[styles.chipLabel, { color: theme.foreground }]}
                >
                  {categoryTitle(c.category)}
                </Text>
              </View>
            ))}
          </View>
          {/* Said on the card itself, so a curated card can't pass for the
              whole record (decided 2026-11-03). */}
          {hidden && (
            <Text
              maxFontSizeMultiplier={CARD_MAX_SCALE}
              style={[styles.hidden, { color: theme.muted }]}
              testID="card-hidden"
            >
              {hidden}
            </Text>
          )}
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
        {/* The growth hook: never the faintest line on the card. A question,
            "What are you sharp at?", until D80 (the owner's line since). */}
        <Text
          maxFontSizeMultiplier={CARD_MAX_SCALE}
          style={[styles.footerHook, { color: theme.accent }]}
        >
          Learn when to trust your gut
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: CARD_RADIUS.identity, padding: 24 },
  // The content is centred in the room between the top and the footer. Its
  // bottom margin keeps the footer's 14pt gap when the content fills the room:
  // without it the chips sat on the divider (playtest 2026-11-08, finding 14).
  body: { flex: 1, justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  bodyCompact: {},
  // Shrunk to fit, it shrinks toward the left edge, which it shares with the
  // footer; about its centre it pulled in from the footer's edge by up to
  // 27pt (playtest 2026-11-08, finding 15).
  content: { gap: 8, transformOrigin: 'left center' },
  hero: { marginBottom: 12 },
  eyebrow: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  identity: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    marginTop: 4,
  },
  contrast: { fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: '700', lineHeight: 26 },
  receipt: { fontFamily: FONT_FAMILY, fontSize: 15, lineHeight: 21, marginTop: 6 },
  strip: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    marginTop: 4,
  },
  stripCell: { alignItems: 'center', flex: 1 },
  stripEnd: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600' },
  // 12, the strip's ends' size, at full ink: smaller, and the fit-to-canvas
  // shrink took it under 11 in the PNG (code review 2026-11-12).
  stripKey: { fontFamily: FONT_FAMILY, fontSize: 12, lineHeight: 15, marginTop: 2 },
  stripEmpty: { borderRadius: 1, height: 2, width: 10 },
  stripThin: { borderRadius: 4, height: 8, width: 8 },
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
  chipLabel: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '700' },
  hidden: { fontFamily: FONT_FAMILY, fontSize: 13, lineHeight: 18 },
  footer: { borderTopWidth: 1, gap: 2, marginTop: 14, paddingTop: 14 },
  footerPinned: { marginTop: 'auto' },
  story: { paddingVertical: 56 },
  footerMark: { fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: '700' },
  footerHook: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '600' },
});

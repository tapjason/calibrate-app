import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { chosenProps } from '@/components/ui/chosen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { track } from '@/analytics/track';
import { resolveTheme } from '@/constants/cardThemes';
import { colors, type } from '@/constants/theme';
import { shareCard, shareText, type ShareOutcome } from '@/share/export';
import { appStoreLink, shareCampaign } from '@/share/link';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';
import { MIN_N_BAND, type Category } from '@/types';
import { categoryTitle, useCategoryStore } from '@/store/categoryStore';

import { CARD_CANVAS_HEIGHT, IdentityCard, type CardFormat } from './IdentityCard';
import { CARD_RADIUS, ScaledCanvas } from './ScaledCanvas';
import { ThemePicker } from './ThemePicker';
import { buildShareCard, cardHiddenCategories, shareText as cardText, showsRanges } from './cardCopy';
import { WarmupCard } from './WarmupCard';
import { warmupCardCopy } from './warmupCardCopy';

export const SQUARES_LATER =
  `Shared as text, your card gets a row of coloured squares once your rating unlocks and a range has ${MIN_N_BAND} scored answers. How scoring works says what they mean.`;

const MESSAGES: Record<Exclude<ShareOutcome, 'shared'>, string> = {
  unavailable: "Sharing isn't available on this device — screenshot it instead.",
  failed: "Couldn't build the image. Try again?",
};

/**
 * The share surface: the card as it will be exported, and one button to send
 * it to the OS share sheet.
 *
 * Free forever, per CLAUDE.md — this component checks no entitlement, and it
 * never should. The free tier is the marketing budget.
 */
export function ShareCardPanel({
  onUpgrade,
  onTakeWarmup,
}: { onUpgrade?: () => void; onTakeWarmup?: () => void } = {}) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const ratingRange = useStatsStore((s) => s.ratingRange);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const warmupResult = useWarmupStore((s) => s.result);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The Warm-up card stays one tap away once the category card takes over:
  // it was the round's most shared thing, and gone after the first answer
  // (blind playtest 2026-11-13c, finding 3).
  // Until the rating unlocks the Warm-up card leads (step 181): the category
  // card then reads "Calibrating" with nothing on it, and all four week-one
  // testers chose the Warm-up card to share (blind playtest 2026-11-14,
  // finding 4). Null until the person switches.
  const [chosenCard, setChosenCard] = useState<'category' | 'warmup' | null>(null);
  // The shape and the categories left off are kept between visits, like the
  // theme: both reset each time Share opened (blind playtest 2026-11-01).
  const format: CardFormat = useSettingsStore((s) => s.cardFormat);
  const setFormat = useSettingsStore((s) => s.setCardFormat);
  const storedHidden = useSettingsStore((s) => s.cardHiddenCategories);
  const setStoredHidden = useSettingsStore((s) => s.setCardHiddenCategories);

  const allOnFile = categoryStats.filter((c) => c.predictions_resolved > 0);
  // Categories the user chose to leave off the card (Any Distance-style
  // show/hide, DESIGN_SYSTEM §7.5). The recaps leave them off too.
  const hidden = cardHiddenCategories(categoryStats, storedHidden);
  // Only what's shown. With nothing left, the card has no categories and
  // says how many are off; nothing unticked comes back (code review, step 179).
  const shown = categoryStats.filter((c) => !hidden.has(c.category));
  const card = buildShareCard(userStat, shown, {
    giveOrTake: ratingRange?.giveOrTake,
    hiddenCount: hidden.size,
  });
  // Every one can come off (owner, 2026-11-14): the card keeps the rating
  // and says how many aren't shown.
  const toggleCategory = (c: Category) => {
    const next = new Set(hidden);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    void setStoredHidden([...next]);
  };
  // resolveTheme, not a raw lookup: a Plus theme held by someone who has
  // lapsed falls back to the free one instead of erroring or rendering blank.
  const theme = resolveTheme(cardThemeId, isPlus);
  // Before any real prediction resolves, the Warmup verdict is the card
  // (DESIGN_SYSTEM rule 0.10: Share is never empty).
  const warmupCopy = warmupCardCopy(warmupResult, card !== null);
  const showWarmup = chosenCard ? chosenCard === 'warmup' : card !== null && card.rating === null;
  const warmup = card && !showWarmup ? null : warmupCopy;
  // Which card the preview and Share my card are about.
  const sharingCard = warmup ? null : card;

  if (!card && !warmup) {
    return (
      <EmptyState
        testID="share-empty"
        symbol={{ sf: 'square.and.arrow.up', fallback: 'share-outline' }}
        message="Take the 60-second warm-up for your first card, or answer a prediction and your category card appears here."
        actionLabel={onTakeWarmup ? 'Take the warm-up' : undefined}
        onAction={onTakeWarmup}
      />
    );
  }

  const onShare = async () => {
    setSharing(true);
    setMessage(null);
    try {
      const outcome = await shareCard(cardRef);
      setMessage(outcome === 'shared' ? null : MESSAGES[outcome]);
      // Share rate is the number that decides whether the generous free tier
      // pays for itself (GROWTH §7-8). Only a card that actually reached the
      // share sheet counts.
      if (outcome === 'shared') {
        void track('share_completed', { surface: sharingCard ? 'card' : 'warmup' });
      }
    } finally {
      setSharing(false);
    }
  };

  const onShareText = async () => {
    if (!sharingCard) return;
    setMessage(null);
    // The text share can carry the App Store link; the image can't (GROWTH §0).
    const link = appStoreLink(shareCampaign('card', 'text'));
    const outcome = await shareText(cardText(sharingCard, buckets, link));
    setMessage(outcome === 'shared' ? null : MESSAGES[outcome]);
    if (outcome === 'shared') void track('share_completed', { surface: 'card' });
  };

  return (
    <View style={styles.wrap} testID="share-panel">
      {/* Every card on the 360pt canvas, scaled to the screen (steps 53, 57). */}
      {/* Keyed, so switching cards remounts the canvas and it measures again
          unseen (code review, step 177). */}
      {sharingCard ? (
        <ScaledCanvas
          key="identity"
          height={CARD_CANVAS_HEIGHT[format]}
          radius={CARD_RADIUS.identity}
          testID="card-preview"
        >
          <IdentityCard
            ref={cardRef}
            card={sharingCard}
            theme={theme}
            buckets={buckets}
            format={format}
          />
        </ScaledCanvas>
      ) : (
        warmup && (
          <ScaledCanvas key="warmup" radius={CARD_RADIUS.warmup} testID="card-preview">
            <WarmupCard ref={cardRef} copy={warmup} theme={theme} />
          </ScaledCanvas>
        )
      )}

      {/* The action right under what it shares. Below Shape, On the card and
          the themes it sat about 950pt down, a scroll and a half on a 667pt
          phone; the options are adjustments, not steps. */}
      <Button
        label={sharing ? 'Preparing…' : 'Share my card'}
        testID="share-button"
        disabled={sharing}
        onPress={onShare}
      />
      {sharingCard && (
        <Button
          label="Share as text"
          variant="secondary"
          testID="share-text-button"
          disabled={sharing}
          onPress={() => void onShareText()}
        />
      )}

      {/* Both cards one tap apart once there's a category card. */}
      {card && warmupCopy && (
        <Button
          label={warmup ? 'Show my category card' : 'Show my warm-up card'}
          variant="secondary"
          testID="share-switch-card"
          disabled={sharing}
          onPress={() => {
            setMessage(null);
            setChosenCard(warmup ? 'category' : 'warmup');
          }}
        />
      )}

      {/* Before the squares, when they come and where they're explained
          (roadmap D60 (c); blind playtest 2026-11-13b, run 5). */}
      {sharingCard && !showsRanges(sharingCard, buckets) && (
        <Text style={styles.message} testID="share-squares-later">
          {SQUARES_LATER}
        </Text>
      )}

      {message && (
        <Text style={styles.message} testID="share-message">
          {message}
        </Text>
      )}

      {sharingCard && (
        <View style={styles.controls}>
          <Text style={styles.controlLabel}>Shape</Text>
          <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Shape">
            {(['post', 'story'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => void setFormat(f)}
                accessibilityRole="radio"
                {...chosenProps('radio', format === f)}
                testID={`share-format-${f}`}
                style={[styles.segment, format === f && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, format === f && styles.segmentTextOn]}>
                  {f === 'post' ? 'Post (3:4)' : 'Story (9:16)'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Even one: it can come off, and back on (owner, 2026-11-14). */}
          {allOnFile.length > 0 && (
            <>
              <Text style={styles.controlLabel}>On the card</Text>
              <View style={styles.chips}>
                {allOnFile.map((c) => {
                  const on = !hidden.has(c.category);
                  return (
                    <Pressable
                      key={c.category}
                      onPress={() => toggleCategory(c.category)}
                      accessibilityRole="checkbox"
                      {...chosenProps('checkbox', on)}
                      accessibilityLabel={`Show ${categoryTitle(c.category)} on the card`}
                      testID={`share-toggle-${c.category}`}
                      // 36pt tall: the slop takes the target to 44 (as
                      // History's chips; code review, 2026-11-14).
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      {on && (
                        <Icon
                          sf="checkmark"
                          fallback="checkmark"
                          size={14}
                          color={colors.onAction}
                        />
                      )}
                      <Text
                        style={[styles.chipText, styles.chipTextFit, on && styles.chipTextOn]}
                        numberOfLines={1}
                      >
                        {categoryTitle(c.category)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}

      <ThemePicker onUpgrade={onUpgrade} />

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  message: { ...type.footnote, color: colors.textSecondary, textAlign: 'center' },
  controls: { gap: 8 },
  controlLabel: { ...type.footnote, color: colors.textSecondary, fontWeight: '600' },
  segmented: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 999,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { ...type.subhead, color: colors.textSecondary },
  segmentTextOn: { color: colors.textPrimary, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    alignItems: 'center',
    borderColor: colors.controlBorder,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { ...type.subhead, color: colors.textSecondary },
  chipTextOn: { color: colors.onAction, fontWeight: '600' },
  chipTextFit: { flexShrink: 1 },
});

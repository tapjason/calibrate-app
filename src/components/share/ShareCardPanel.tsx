import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { track } from '@/analytics/track';
import { resolveTheme } from '@/constants/cardThemes';
import { colors } from '@/constants/theme';
import { shareCard, shareText, type ShareOutcome } from '@/share/export';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';
import type { Category } from '@/types';

import { IdentityCard, type CardFormat } from './IdentityCard';
import { ThemePicker } from './ThemePicker';
import { buildShareCard, shareText as cardText } from './cardCopy';
import { WarmupCard } from './WarmupCard';
import { warmupCardCopy } from './warmupCardCopy';

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
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const warmupResult = useWarmupStore((s) => s.result);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [format, setFormat] = useState<CardFormat>('post');
  // Categories the user chose to leave off the card (Any Distance-style
  // show/hide, DESIGN_SYSTEM §7.5). Never all of them: the last one stays.
  const [hidden, setHidden] = useState<ReadonlySet<Category>>(new Set());

  const allOnFile = categoryStats.filter((c) => c.predictions_resolved > 0);
  const shown = categoryStats.filter((c) => !hidden.has(c.category));
  const card = buildShareCard(
    userStat,
    shown.some((c) => c.predictions_resolved > 0) ? shown : categoryStats,
  );
  const toggleCategory = (c: Category) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else if (allOnFile.length - next.size > 1) next.add(c);
      return next;
    });
  // resolveTheme, not a raw lookup: a Plus theme held by someone who has
  // lapsed falls back to the free one instead of erroring or rendering blank.
  const theme = resolveTheme(cardThemeId, isPlus);
  // Before any real prediction resolves, the Warmup verdict is the card
  // (DESIGN_SYSTEM rule 0.10: Share is never empty).
  const warmup = card ? null : warmupCardCopy(warmupResult);

  if (!card && !warmup) {
    return (
      <EmptyState
        testID="share-empty"
        message="Take the 60-second warm-up for your first card, or resolve a prediction and your category card appears here."
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
        void track('share_completed', { surface: card ? 'card' : 'warmup' });
      }
    } finally {
      setSharing(false);
    }
  };

  const onShareText = async () => {
    if (!card) return;
    setMessage(null);
    const outcome = await shareText(cardText(card, buckets));
    setMessage(outcome === 'shared' ? null : MESSAGES[outcome]);
    if (outcome === 'shared') void track('share_completed', { surface: 'card' });
  };

  return (
    <View style={styles.wrap} testID="share-panel">
      {card ? (
        <IdentityCard
          ref={cardRef}
          card={card}
          theme={theme}
          buckets={buckets}
          format={format}
        />
      ) : (
        warmup && <WarmupCard ref={cardRef} copy={warmup} theme={theme} />
      )}

      {card && (
        <View style={styles.controls}>
          <Text style={styles.controlLabel}>Shape</Text>
          <View style={styles.segmented} accessibilityRole="radiogroup">
            {(['post', 'story'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFormat(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: format === f }}
                testID={`share-format-${f}`}
                style={[styles.segment, format === f && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, format === f && styles.segmentTextOn]}>
                  {f === 'post' ? 'Post · 3:4' : 'Story · 9:16'}
                </Text>
              </Pressable>
            ))}
          </View>

          {allOnFile.length > 1 && (
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
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Show ${c.category} on the card`}
                      testID={`share-toggle-${c.category}`}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      {on && (
                        <Icon
                          sf="checkmark"
                          fallback="checkmark"
                          size={14}
                          color={colors.brand800}
                        />
                      )}
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {c.category}
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

      <Button
        label={sharing ? 'Preparing…' : 'Share my card'}
        testID="share-button"
        disabled={sharing}
        onPress={onShare}
      />
      {card && (
        <Button
          label="Share as text"
          variant="secondary"
          testID="share-text-button"
          disabled={sharing}
          onPress={() => void onShareText()}
        />
      )}

      {message && (
        <Text style={styles.message} testID="share-message">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  message: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  controls: { gap: 8 },
  controlLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
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
  segmentText: { color: colors.textSecondary, fontSize: 15 },
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
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  chipText: { color: colors.textSecondary, fontSize: 15, textTransform: 'capitalize' },
  chipTextOn: { color: colors.brand800, fontWeight: '600' },
});

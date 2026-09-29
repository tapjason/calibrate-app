import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { track } from '@/analytics/track';
import { resolveTheme } from '@/constants/cardThemes';
import { colors } from '@/constants/theme';
import { shareCard, shareText, type ShareOutcome } from '@/share/export';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';

import { IdentityCard } from './IdentityCard';
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

  const card = buildShareCard(userStat, categoryStats);
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
        <IdentityCard ref={cardRef} card={card} theme={theme} />
      ) : (
        warmup && <WarmupCard ref={cardRef} copy={warmup} theme={theme} />
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
});

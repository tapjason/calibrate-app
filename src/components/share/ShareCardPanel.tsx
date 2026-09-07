import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { track } from '@/analytics/track';
import { resolveTheme } from '@/constants/cardThemes';
import { shareCard, type ShareOutcome } from '@/share/export';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';

import { IdentityCard } from './IdentityCard';
import { ThemePicker } from './ThemePicker';
import { buildShareCard } from './cardCopy';

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
export function ShareCardPanel({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const card = buildShareCard(userStat, categoryStats);
  // resolveTheme, not a raw lookup: a Plus theme held by someone who has
  // lapsed falls back to the free one instead of erroring or rendering blank.
  const theme = resolveTheme(cardThemeId, isPlus);

  if (!card) {
    return (
      <View style={styles.empty} testID="share-empty">
        <Text style={styles.emptyTitle}>Nothing to share yet</Text>
        <Text style={styles.emptyBody}>
          Resolve a prediction or two and your category card appears here.
        </Text>
      </View>
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
      if (outcome === 'shared') void track('share_completed', { surface: 'card' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap} testID="share-panel">
      <IdentityCard ref={cardRef} card={card} theme={theme} />

      <ThemePicker onUpgrade={onUpgrade} />

      <Button
        label={sharing ? 'Preparing…' : 'Share my card'}
        testID="share-button"
        disabled={sharing}
        onPress={onShare}
      />

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
  message: { color: '#b45309', fontSize: 13, textAlign: 'center' },
  empty: { gap: 6, paddingVertical: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyBody: { color: '#6b7280', fontSize: 14, lineHeight: 20 },
});

import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { shareCard, type ShareOutcome } from '@/share/export';
import { useStatsStore } from '@/store/statsStore';

import { IdentityCard } from './IdentityCard';
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
export function ShareCardPanel() {
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const card = buildShareCard(userStat, categoryStats);

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
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap} testID="share-panel">
      <IdentityCard ref={cardRef} card={card} />

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

import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { buildWrapped, type WrappedSpan } from '@/engine/wrapped';
import { Button } from '@/components/ui/Button';
import { shareCard, type ShareOutcome } from '@/share/export';
import { usePredictionStore } from '@/store/predictionStore';

import { WrappedCard } from './WrappedCard';

interface WrappedPanelProps {
  span: WrappedSpan;
}

const MESSAGES: Record<Exclude<ShareOutcome, 'shared'>, string> = {
  unavailable: "Sharing isn't available on this device — screenshot it instead.",
  failed: "Couldn't build the image. Try again?",
};

/**
 * Calibration Wrapped for one window, with its share button.
 *
 * The recap is derived on render from the resolved list rather than stored:
 * it is a pure function of predictions the store already holds, and caching it
 * would only create a second thing to invalidate every time a resolution
 * lands.
 */
export function WrappedPanel({ span }: WrappedPanelProps) {
  const resolved = usePredictionStore((s) => s.resolved);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // `now` is frozen per render pass of this list so the window doesn't shift
  // underneath a capture that's already in flight.
  const summary = useMemo(
    () => buildWrapped(resolved, span, new Date()),
    [resolved, span],
  );

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
    <View style={styles.wrap} testID={`wrapped-panel-${span}`}>
      <WrappedCard ref={cardRef} summary={summary} />

      <Button
        label={sharing ? 'Preparing…' : 'Share my recap'}
        testID="wrapped-share-button"
        disabled={sharing || summary.resolved === 0}
        onPress={onShare}
      />

      {message && (
        <Text style={styles.message} testID="wrapped-share-message">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  message: { color: '#b45309', fontSize: 13, textAlign: 'center' },
});

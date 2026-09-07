import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { buildWrapped, type WrappedSpan } from '@/engine/wrapped';
import { Button } from '@/components/ui/Button';
import { track } from '@/analytics/track';
import { resolveTheme, WRAPPED_DEFAULT_THEME } from '@/constants/cardThemes';
import { shareCard, type ShareOutcome } from '@/share/export';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // `now` is frozen per render pass of this list so the window doesn't shift
  // underneath a capture that's already in flight.
  const summary = useMemo(
    () => buildWrapped(resolved, span, new Date()),
    [resolved, span],
  );

  // Wrapped's own free look is indigo, so an unthemed card keeps it; a chosen
  // Plus theme applies to both cards, which is what makes it feel like a look
  // rather than a per-screen setting.
  const chosen = resolveTheme(cardThemeId, isPlus);
  const theme = chosen.plus ? chosen : WRAPPED_DEFAULT_THEME;

  const onShare = async () => {
    setSharing(true);
    setMessage(null);
    try {
      const outcome = await shareCard(cardRef);
      setMessage(outcome === 'shared' ? null : MESSAGES[outcome]);
      if (outcome === 'shared') {
        void track('share_completed', {
          surface: span === 'week' ? 'weekly' : 'yearly',
        });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap} testID={`wrapped-panel-${span}`}>
      <WrappedCard ref={cardRef} summary={summary} theme={theme} />

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

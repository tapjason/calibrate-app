import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';

interface CoverageNudgeProps {
  /** Confidence the accept button pre-sets, shown in the copy. */
  suggestedConfidence: number;
  /** Pre-set the slider low and dismiss. */
  onAccept: () => void;
  /** Dismiss without changing anything. */
  onDismiss: () => void;
}

/**
 * The range-coverage nudge (CLAUDE.md, "Range coverage caveat"): an invitation
 * to log something the user thinks *won't* happen.
 *
 * Presentational on purpose — whether to show this, and the cooldown behind
 * it, are decided in `src/engine/coverageNudge.ts` and read through the stats
 * store. This file only knows how it looks.
 *
 * Tone matters here more than usual. This appears in the core loop, which is
 * the one place the app must never lecture: it explains what the app can't
 * see yet rather than what the user is doing wrong, and "Not now" is a real
 * answer that buys a week of silence.
 */
export function CoverageNudge({
  suggestedConfidence,
  onAccept,
  onDismiss,
}: CoverageNudgeProps) {
  return (
    <View style={styles.wrap} testID="coverage-nudge">
      <Text style={styles.title}>Try one you think won't happen</Text>
      <Text style={styles.body}>
        Everything you've logged lately sits above {LOW_END_LABEL}%. That only
        measures the confident half of you — a score built on one end of the
        range is a score about that end. Something you'd put at{' '}
        {suggestedConfidence}% tells us far more.
      </Text>
      <View style={styles.actions}>
        <Button
          label={`Start at ${suggestedConfidence}%`}
          onPress={onAccept}
          testID="coverage-nudge-accept"
        />
        <Button
          label="Not now"
          variant="secondary"
          onPress={onDismiss}
          testID="coverage-nudge-dismiss"
        />
      </View>
    </View>
  );
}

/**
 * Mirrors LOW_END_MAX in the engine. Copy, not logic — the number the user
 * reads, kept here so the component stays free of engine imports.
 */
const LOW_END_LABEL = 40;

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#3730A3' },
  body: { fontSize: 13, lineHeight: 19, color: '#4338CA' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});

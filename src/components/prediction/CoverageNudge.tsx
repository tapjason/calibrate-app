import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/constants/theme';

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
      {/* Plain, and no more than true: "the confident half of you… tells us
          far more" read as self-help (blind playtest 2026-11-09b, finding 6).
          D76 (the voice pass, 2026-11-23): the fact, then the ask, read in
          that order, in place of a title and a 45-word reason. */}
      <Text style={styles.title} testID="coverage-nudge-fact">
        Everything lately is above {LOW_END_LABEL}%.
      </Text>
      <Text style={styles.body} testID="coverage-nudge-ask">
        Try one you think probably won&apos;t happen.
      </Text>
      <View style={styles.actions}>
        {/* Secondary on purpose: Save is the one primary action on Log
            (DESIGN_SYSTEM §7.12). */}
        <Button
          label={`Start at ${suggestedConfidence}%`}
          variant="secondary"
          onSunken
          onPress={onAccept}
          testID="coverage-nudge-accept"
        />
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.notNow}
          testID="coverage-nudge-dismiss"
        >
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Mirrors LOW_END_MAX in the engine. Copy, not logic — the number the user
 * reads, kept here so the component stays free of engine imports.
 */
const LOW_END_LABEL = 40;

// A quiet inline card: sunken, not brand-tinted, so it never competes with
// Save (DESIGN_SYSTEM §7.12).
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    marginBottom: space.lg,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  actions: { alignItems: 'center', flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  notNow: { paddingVertical: space.sm },
  notNowText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
});

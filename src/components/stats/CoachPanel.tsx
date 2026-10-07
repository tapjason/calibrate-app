import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, FONT_FAMILY, radius, space, tabularNums, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import type { CoachInsight } from '@/types';

import { coachReceipt } from './coachReceipt';
import { SupportSurface } from './SupportSurface';

/**
 * The Coach surface on Stats (COACH_AGENT.md §8, L6).
 *
 * Pull, not push: the user asks. Every render path here is a no-op unless the
 * user is Plus AND has turned Coach on, so a free user sees a one-line upsell
 * and never triggers a request.
 *
 * The AI label is not decoration — §5.6 requires the Coach be clearly marked
 * as AI wherever it speaks.
 */
export function CoachPanel({
  onUpgrade,
  onSignIn,
  upsell = true,
}: {
  onUpgrade?: () => void;
  onSignIn?: () => void;
  /** False when the screen shows one shared Plus teaser instead. */
  upsell?: boolean;
} = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const authStatus = useAuthStore((s) => s.status);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const userStat = useStatsStore((s) => s.userStat);
  const resolved = usePredictionStore((s) => s.resolved);

  const insights = useCoachStore((s) => s.insights);
  const crisisTopic = useCoachStore((s) => s.crisisTopic);
  const loading = useCoachStore((s) => s.loading);
  const failed = useCoachStore((s) => s.lastRequestFailed);
  const lastAnsweredAt = useCoachStore((s) => s.lastAnsweredAt);
  const requestInsights = useCoachStore((s) => s.requestInsights);

  // Dismissed cards stay hidden until the next answer (HIG Generative AI:
  // let people dismiss content they don't want). Keyed by position, and reset
  // whenever a new answer lands so a fresh insight is never pre-hidden.
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => setDismissed(new Set()), [lastAnsweredAt]);

  if (!isPlus && !upsell) return null;

  if (!isPlus) {
    // Soft, contextual, and one line (§5.3). The upsell sits below the user's
    // own numbers rather than over them, and it never blocks anything on this
    // screen — the score, the curve, the badges, and the share card are all
    // free and already rendered above.
    return (
      <View style={styles.wrap} testID="coach-upsell">
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Plus reads your calibration numbers and tells you what they mean.
        </Text>
        {onUpgrade && (
          <Button
            label="See Plus"
            variant="secondary"
            testID="coach-upsell-cta"
            onPress={onUpgrade}
          />
        )}
      </View>
    );
  }

  // Plus is on the device (a guest can buy it), but the Coach runs on the
  // server, which answers 401 to anyone without a session. Asking anyway just
  // renders "unavailable" to someone who paid for this, so say what's needed.
  if (authStatus === 'guest') {
    return (
      <View style={styles.wrap} testID="coach-needs-account">
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Sign in to use Coach. It runs on our server, which needs to know it's
          you. Your predictions come with you.
        </Text>
        {onSignIn && (
          <Button
            label="Sign in"
            variant="secondary"
            testID="coach-sign-in"
            onPress={onSignIn}
          />
        )}
      </View>
    );
  }

  if (!coachEnabled) {
    return (
      <View style={styles.wrap} testID="coach-disabled">
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Turn Coach on under You to get AI feedback on your calibration.
        </Text>
      </View>
    );
  }

  const onAsk = () =>
    void requestInsights({ userStat, resolved, isPlus, enabled: coachEnabled });

  return (
    <View style={styles.wrap} testID="coach-panel">
      <View style={styles.header}>
        <Text style={styles.heading}>Coach</Text>
        <Text style={styles.aiLabel}>AI</Text>
      </View>

      {crisisTopic ? (
        <SupportSurface topic={crisisTopic} />
      ) : (
        <>
          {insights.map((insight, i) =>
            dismissed.has(i) ? null : (
              <InsightCard
                key={`${insight.category}-${i}`}
                insight={insight}
                onDismiss={() => setDismissed((prev) => new Set(prev).add(i))}
              />
            ),
          )}

          {insights.length > 0 && (
            // Calibrated trust, not maximum trust (PAIR; DESIGN_SYSTEM §7.13).
            <Text style={styles.caveat} testID="coach-caveat">
              Coach reads your numbers, not your predictions. It can be wrong.
            </Text>
          )}

          {insights.length === 0 && lastAnsweredAt && !failed && (
            <Text style={styles.muted} testID="coach-nothing-to-say">
              Nothing worth flagging yet — keep logging and resolving.
            </Text>
          )}

          {failed && (
            <Text style={styles.muted} testID="coach-unavailable">
              Coach is unavailable right now.
            </Text>
          )}

          {!lastAnsweredAt && (
            // Said again at the point of sending, not only in Settings
            // (Guideline 5.1.2(i); APP_PRIVACY.md).
            <Text style={styles.caveat} testID="coach-disclosure">
              Get feedback sends your calibration numbers, never your predictions,
              to OpenAI to write it.
            </Text>
          )}
        </>
      )}

      <Button
        label={loading ? 'Reading your numbers…' : 'Get feedback'}
        testID="coach-ask"
        disabled={loading}
        onPress={onAsk}
      />
    </View>
  );
}

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: CoachInsight;
  onDismiss: () => void;
}) {
  const receipt = insight.evidence_source ? coachReceipt(insight.evidence_source) : null;
  return (
    <View style={styles.card} testID={`coach-insight-${insight.category}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.category}>{insight.category}</Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this insight"
          hitSlop={12}
          testID={`coach-dismiss-${insight.category}`}
        >
          <Text style={styles.dismiss}>×</Text>
        </Pressable>
      </View>
      {/* Lead with the receipt: the validated number and what it counts, so
          the user can check the Coach against the chart (DESIGN_SYSTEM §7.13). */}
      {receipt && (
        <View
          style={styles.receipt}
          accessible
          accessibilityLabel={`${receipt.figure}, ${receipt.label}`}
          testID="coach-receipt"
        >
          <Text style={styles.receiptFigure}>{receipt.figure}</Text>
          <Text style={styles.receiptLabel}>{receipt.label}</Text>
        </View>
      )}
      <Text style={styles.message}>{insight.message}</Text>
      {insight.suggestion && (
        <Text style={styles.suggestion}>{insight.suggestion}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, padding: space.lg, paddingTop: 0 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  heading: { ...type.headline, color: colors.textPrimary },
  aiLabel: {
    ...type.caption,
    backgroundColor: colors.brand50,
    borderRadius: radius.xs,
    color: colors.brand800,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  muted: { ...type.subhead, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    padding: space.lg,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dismiss: { ...type.title3, color: colors.textTertiary, lineHeight: 20 },
  receipt: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  receiptFigure: { ...type.title2, ...tabularNums, color: colors.textPrimary, fontFamily: FONT_FAMILY },
  receiptLabel: { ...type.footnote, color: colors.textSecondary },
  message: { ...type.body, color: colors.textPrimary },
  suggestion: { ...type.callout, color: colors.textSecondary },
  caveat: { ...type.footnote, color: colors.textTertiary },
});

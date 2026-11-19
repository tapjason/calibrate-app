import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LOCAL_ONLY_COACH } from '@/components/age/localOnlyCopy';
import { Button } from '@/components/ui/Button';
import { colors, FONT_FAMILY, radius, space, tabularNums, type } from '@/constants/theme';
import { useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL, type CoachInsight } from '@/types';
import {
  categoryTitle,
  useCategoryStore,
  visibleCategoryLabel,
  visibleCategoryTitle,
} from '@/store/categoryStore';

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
 *
 * Under the under-13 rule (roadmap D70) the Coach is off: with a Plus mirror
 * already on the phone the panel says so in one line, and otherwise it isn't
 * drawn. Nothing then offers Plus or a sign-in, and no request is possible.
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
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const localOnly = useAgeStore((s) => s.localOnly);
  const authStatus = useAuthStore((s) => s.status);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const userStat = useStatsStore((s) => s.userStat);
  const resolved = usePredictionStore((s) => s.resolved);

  const insights = useCoachStore((s) => s.insights);
  const crisisTopic = useCoachStore((s) => s.crisisTopic);
  const loading = useCoachStore((s) => s.loading);
  const failed = useCoachStore((s) => s.lastRequestFailed);
  const failure = useCoachStore((s) => s.lastFailure);
  const lastAnsweredAt = useCoachStore((s) => s.lastAnsweredAt);
  const requestInsights = useCoachStore((s) => s.requestInsights);
  const setSupportAside = useCoachStore((s) => s.setSupportAside);
  // Whether the last answer had insights and lost every one to validation
  // (CoachResult.droppedAll, src/ai/coach.ts), as coachStore keeps it in
  // `lastDroppedAll`: false before any answer, after a failure and when the
  // Coach wrote none, so those keep the line they have always had.
  const lastDroppedAll = useCoachStore((s) => s.lastDroppedAll);

  // Dismissed cards stay hidden until the next answer (HIG Generative AI:
  // let people dismiss content they don't want). Keyed by position, and reset
  // whenever a new answer lands so a fresh insight is never pre-hidden.
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => setDismissed(new Set()), [lastAnsweredAt]);

  if (localOnly) {
    // No upsell and no sign-in here: neither is offered on this phone.
    if (!isPlus) return null;
    return (
      <View style={styles.wrap} testID="coach-local-only">
        <Text accessibilityRole="header" style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>{LOCAL_ONLY_COACH}</Text>
      </View>
    );
  }

  if (!isPlus && !upsell) return null;

  if (!isPlus) {
    // Soft, contextual, and one line (§5.3). The upsell sits below the user's
    // own numbers rather than over them, and it never blocks anything on this
    // screen — the score, the curve, the badges, and the share card are all
    // free and already rendered above.
    return (
      <View style={styles.wrap} testID="coach-upsell">
        <Text accessibilityRole="header" style={styles.heading}>Coach</Text>
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
        <Text accessibilityRole="header" style={styles.heading}>Coach</Text>
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
        <Text accessibilityRole="header" style={styles.heading}>Coach</Text>
        <Text style={styles.muted}>
          Turn Coach on under You to get AI feedback on your calibration.
        </Text>
      </View>
    );
  }

  const onAsk = () =>
    void requestInsights({ userStat, resolved, isPlus, enabled: coachEnabled });

  // An answer with nothing to show. Past the overall gate, when the Coach did
  // write insights and none could be backed by the numbers, "keep logging"
  // told someone with 150 answers to do what they had done (Coach re-review,
  // 2026-11-19); that case has its own line. Below the gate, or when the
  // Coach wrote none, the first line stays.
  const answeredEmpty = insights.length === 0 && lastAnsweredAt !== null && !failed;
  const nothingBacked =
    answeredEmpty && lastDroppedAll && (userStat?.total_resolved ?? 0) >= MIN_N_OVERALL;

  return (
    <View style={styles.wrap} testID="coach-panel">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>Coach</Text>
        <Text style={styles.aiLabel}>AI</Text>
      </View>

      {crisisTopic ? (
        // "Back to Coach" sets aside the answered predictions whose words put
        // it up, the same list the request scanned; it comes back only for
        // new matching words (useCoachStore.setSupportAside).
        <SupportSurface topic={crisisTopic} onSetAside={() => setSupportAside(resolved)} />
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

          {answeredEmpty && !nothingBacked && (
            <Text style={styles.muted} testID="coach-nothing-to-say">
              Nothing worth flagging yet — keep logging and answering.
            </Text>
          )}

          {nothingBacked && (
            <Text style={styles.muted} testID="coach-nothing-backed">
              Coach didn't find anything it could back with your numbers this time. Try again
              later.
            </Text>
          )}

          {failed && failure === 'not_entitled' && (
            // The server's Plus check said no while this phone says Plus
            // (step 189): usually RevenueCat hasn't reached our server yet.
            // "Get feedback" below is the way to try again. Not "Restore
            // purchases": the paywall shows a Plus user no Restore button.
            <Text style={styles.muted} testID="coach-not-confirmed">
              Coach couldn't confirm your Plus subscription yet. Try again in a few
              minutes. If it keeps happening, use Help and support in You.
            </Text>
          )}

          {failed && failure === 'nothing_scored' && (
            // No request was made: the Coach reads scored answers only, and a
            // same-day answer isn't one (D41). Step 189; it read "unavailable".
            <Text style={styles.muted} testID="coach-nothing-scored">
              Coach reads your scored answers, and you don't have one yet. An answer
              counts from the day after you logged the prediction.
            </Text>
          )}

          {failed && failure !== 'not_entitled' && failure !== 'nothing_scored' && (
            <Text style={styles.muted} testID="coach-unavailable">
              Coach is unavailable right now.
            </Text>
          )}

          {!lastAnsweredAt && (
            // Said again at the point of sending, not only in Settings
            // (Guideline 5.1.2(i); APP_PRIVACY.md).
            <Text style={styles.caveat} testID="coach-disclosure">
              Get feedback sends your calibration numbers, never your predictions,
              to a third-party AI service to write it.
            </Text>
          )}
        </>
      )}

      {/* Not while the support card is up: there it would only scan the same
          words and bring the same card back. The card and its "Back to
          Coach" are the whole panel then; set aside, the panel is idle and
          this is its way to ask (main session, 2026-11-19). */}
      {!crisisTopic && (
        <Button
          label={loading ? 'Reading your numbers…' : 'Get feedback'}
          testID="coach-ask"
          disabled={loading}
          onPress={onAsk}
        />
      )}
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
  // A renamed built-in's name stays off while the words are hidden (step 179),
  // in the receipt as in the header.
  const hideTitles = useSettingsStore((s) => s.hideTitles);
  const receipt = insight.evidence_source
    ? coachReceipt(insight.evidence_source, (c) => visibleCategoryLabel(c, hideTitles))
    : null;
  return (
    <View style={styles.card} testID={`coach-insight-${insight.category}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.category} numberOfLines={1}>
          {insight.category === 'overall'
            ? categoryTitle('overall')
            : visibleCategoryTitle(insight.category, hideTitles)}
        </Text>
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
    backgroundColor: colors.selectedFill,
    borderRadius: radius.xs,
    color: colors.selectedText,
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
  },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    flexShrink: 1,
    fontWeight: '600',
  },
  dismiss: { ...type.title3, color: colors.textTertiary, lineHeight: 20 },
  receipt: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  receiptFigure: { ...type.title2, ...tabularNums, color: colors.textPrimary, fontFamily: FONT_FAMILY },
  receiptLabel: { ...type.footnote, color: colors.textSecondary },
  message: { ...type.body, color: colors.textPrimary },
  suggestion: { ...type.callout, color: colors.textSecondary },
  caveat: { ...type.footnote, color: colors.textTertiary },
});

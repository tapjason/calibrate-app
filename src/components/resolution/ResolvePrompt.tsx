import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_BUCKET_N_FOR_VERDICT } from '@/components/stats/chartTakeaway';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { CategoryIcon, Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import {
  colors,
  radius,
  roundedFamily,
  space,
  tabularNums,
  type,
} from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { BucketStat, Milestone, Prediction, ResolvedStatus } from '@/types';

import { MilestoneCard } from './MilestoneCard';
import { StreakCheckpointCard } from './StreakCheckpointCard';

interface ResolvePromptProps {
  /** Prediction id read from the URL or notification payload. */
  predictionId: string;
  /** Called when the user is finished here (after answering, or skipping). */
  onResolved?: () => void;
  /**
   * The reflection typed so far and not yet saved ('' when there is none), so
   * the screen can ask before a swipe-down throws it away.
   */
  onDraftChange?: (draft: string) => void;
  /** The finishing button after an answer: "Done" alone, "Next" in a run. */
  advanceLabel?: string;
  /**
   * In a run the reflection waits behind "Add a reflection", so moving on is
   * one tap; on its own it's open, since there's nothing else to do.
   */
  reflectionCollapsed?: boolean;
  /**
   * "Log it again" (roadmap step 22): offered after Yes or No when set. The
   * reflection is saved first, as with Done. Left unset inside a run, where
   * leaving for the Log screen would end the run.
   */
  onPredictAgain?: (prediction: Prediction) => void;
}

/**
 * "In your 60–80% range, 6 of 9 have happened." Counts, not a verdict, so it
 * is honest below min-N — and it is the natural-frequency habit applied at the
 * moment it means most (DESIGN_SYSTEM §7.10).
 *
 * From MIN_BUCKET_N_FOR_VERDICT resolved, the range's own comparison follows
 * (roadmap step 58): "That's 52%, against the 48% you said." Calibration
 * feedback, said against what happened, is what moved forecasters' calibration
 * in the studies; bare outcomes barely did (research/confidence-2026-10.md
 * §6). Both numbers come from the engine's bucket, as on the Stats table.
 */
export function bucketLine(bucket: BucketStat): string {
  const range = `${bucket.low}–${bucket.high}%`;
  const n = bucket.total_resolved;
  if (n === 1) return `That's your first call in the ${range} range.`;
  const counts = `In your ${range} range, ${bucket.resolved_yes} of ${n} have happened.`;
  if (n < MIN_BUCKET_N_FOR_VERDICT) return counts;
  const happened = Math.round(bucket.actual_rate * 100);
  const said = Math.round(bucket.stated_confidence_mean);
  return `${counts} That's ${happened}%, against the ${said}% you said.`;
}

/**
 * Resolve one prediction: what you said, then the question, then — after the
 * answer — one factual line about that confidence range and an optional
 * reflection. The reflection comes after the answer because typing first
 * would delay the only required tap.
 *
 * The id arrives untrusted (URL or notification payload). predictionStore
 * .getById applies the current-user filter, so a crafted deep-link can't
 * surface another user's prediction.
 */
export function ResolvePrompt({
  predictionId,
  onResolved,
  onDraftChange,
  advanceLabel = 'Done',
  reflectionCollapsed = false,
  onPredictAgain,
}: ResolvePromptProps) {
  const [loading, setLoading] = useState(true);
  const [reflectionOpen, setReflectionOpen] = useState(!reflectionCollapsed);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Set once Yes or No has been recorded: the acknowledgement step. */
  const [answered, setAnswered] = useState<{
    outcome: 'resolved_yes' | 'resolved_no';
    line: string | null;
    milestone: Milestone | null;
    /** A streak checkpoint this answer reached (7, 30, 100…), and the next one. */
    checkpoint: { days: number; next: number } | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await usePredictionStore.getState().getById(predictionId);
        setPrediction(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [predictionId]);

  useEffect(() => {
    onDraftChange?.(answered ? reflection : '');
  }, [answered, reflection, onDraftChange]);

  const submit = async (outcome: ResolvedStatus) => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      // Anything left over belongs to an earlier change (a sync, say), not to
      // this answer — clear it so the card below celebrates only this one.
      useStatsStore.getState().clearMilestone();
      usePredictionStore.getState().clearStreakCheckpoint();
      await usePredictionStore.getState().resolve(prediction.id, outcome);
      // One haptic for Yes, No and Skip alike — a No is not an error.
      haptics.resolve();
      if (outcome === 'skipped') {
        onResolved?.();
        return;
      }
      // Stats recompute inside resolve(), so the bucket already counts this one.
      const stats = useStatsStore.getState();
      const bucket = stats.bucketFor(prediction.confidence);
      const predictions = usePredictionStore.getState();
      const days = predictions.streakCheckpoint;
      setAnswered({
        outcome,
        line: bucket ? bucketLine(bucket) : null,
        milestone: stats.milestone,
        checkpoint:
          days === null ? null : { days, next: predictions.streakNow().nextCheckpoint },
      });
      stats.clearMilestone();
      predictions.clearStreakCheckpoint();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const changeAnswer = async () => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      await usePredictionStore.getState().reopen(prediction.id);
      // A milestone from the withdrawn answer mustn't linger for the next one.
      useStatsStore.getState().clearMilestone();
      setReflection('');
      setReflectionOpen(!reflectionCollapsed);
      setAnswered(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** Save any reflection, then leave: by default to wherever the screen goes. */
  const finish = async (then: () => void = () => onResolved?.()) => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      if (reflection.trim().length > 0) {
        await usePredictionStore.getState().reflect(prediction.id, reflection);
      }
      then();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!prediction) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Prediction not found</Text>
        <Text style={styles.notFoundBody}>
          It may have been deleted, or this link is for a different account.
        </Text>
      </View>
    );
  }

  if (answered) {
    // Same acknowledgement for Yes and No (rule 0.4): no outcome colour, no
    // celebration — a precise, neutral "recorded".
    return (
      <View style={styles.wrap} testID="resolve-recorded">
        {/* Says which answer was recorded, in neutral ink: filled vs hollow
            glyph plus words, never green vs red (DESIGN_SYSTEM §2.4). */}
        <View style={styles.recordedRow}>
          <Icon
            sf={answered.outcome === 'resolved_yes' ? 'checkmark.circle.fill' : 'xmark.circle'}
            fallback={
              answered.outcome === 'resolved_yes' ? 'checkmark-circle' : 'close-circle-outline'
            }
            size={20}
            color={colors.textPrimary}
          />
          <Text style={styles.recorded} accessibilityRole="header" testID="resolve-recorded-label">
            {answered.outcome === 'resolved_yes'
              ? 'Recorded: it happened'
              : "Recorded: it didn't happen"}
          </Text>
        </View>
        <Text style={styles.title}>{prediction.title}</Text>
        {/* One card at a time: a score or badge milestone outranks a streak
            checkpoint, which Home's streak row still names all day. */}
        {answered.milestone ? (
          <MilestoneCard milestone={answered.milestone} />
        ) : (
          answered.checkpoint && (
            <StreakCheckpointCard
              days={answered.checkpoint.days}
              next={answered.checkpoint.next}
            />
          )
        )}
        {answered.line && (
          <View style={styles.bucketBox}>
            <Text style={styles.bucketLine} testID="resolve-bucket-line">
              {answered.line}
            </Text>
          </View>
        )}

        {reflectionOpen ? (
          <TextField
            label="Reflection (optional)"
            value={reflection}
            onChangeText={setReflection}
            placeholder="What surprised you?"
            multiline
            maxLength={500}
            testID="reflection-field"
          />
        ) : (
          <Pressable
            onPress={() => setReflectionOpen(true)}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.addReflection}
            testID="resolve-add-reflection"
          >
            <Text style={styles.changeAnswerText}>Add a reflection</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label={submitting ? 'Saving…' : advanceLabel}
          onPress={() => void finish()}
          disabled={submitting}
          testID="resolve-done"
        />
        {onPredictAgain && (
          <View style={styles.again}>
            <Button
              label="Log it again"
              variant="secondary"
              onPress={() => void finish(() => onPredictAgain(prediction))}
              disabled={submitting}
              testID="resolve-again"
            />
          </View>
        )}
        {/* A mis-tap shouldn't be permanent (HIG: let people undo). */}
        <Pressable
          onPress={() => void changeAnswer()}
          disabled={submitting}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.changeAnswer}
          testID="resolve-change"
        >
          <Text style={styles.changeAnswerText}>Change answer</Text>
        </Pressable>
      </View>
    );
  }

  // A skip can be taken back (roadmap step 39). It never counted, so
  // answering it later can't move a score after the fact, and a mis-tap on
  // "Can't tell" otherwise had no undo (HIG: let people undo).
  if (prediction.status === 'skipped') {
    const answerNow = async () => {
      setError(null);
      setSubmitting(true);
      try {
        await usePredictionStore.getState().reopen(prediction.id);
        setPrediction({ ...prediction, status: 'pending', resolved_at: null, reflection: null });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <View style={styles.center} testID="resolve-skipped">
        <Text style={styles.notFoundTitle}>Not scored</Text>
        <Text style={[styles.notFoundBody, styles.skippedBody]}>
          You marked “{prediction.title}” as can’t tell. If you can tell now, answer it
          and it counts like any other.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          label={submitting ? '…' : 'Answer it now'}
          variant="secondary"
          onPress={() => void answerNow()}
          disabled={submitting}
          testID="resolve-unskip"
        />
      </View>
    );
  }

  if (prediction.status !== 'pending') {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Already resolved</Text>
        <Text style={styles.notFoundBody}>This prediction has already been recorded.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* The stated confidence comes first, before the outcome is asked for:
          once people know how it turned out they misremember how sure they
          were (hindsight bias; DESIGN_SYSTEM §7.10). */}
      <Text style={styles.stated} testID="resolve-stated">
        On {formatLogged(prediction.created_at)} you said{' '}
        <Text style={styles.statedNumber}>{prediction.confidence}%</Text>
      </Text>
      <View style={styles.categoryRow}>
        <CategoryIcon category={prediction.category} size={14} color={colors.textSecondary} />
        <Text style={styles.category}>{prediction.category}</Text>
      </View>
      <Text style={styles.title}>{prediction.title}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.question} accessibilityRole="header">
        Did it happen?
      </Text>
      {/* Yes and No share one neutral style: a No is an outcome, not a
          failure, and red is for destructive actions (DESIGN_SYSTEM §7.10). */}
      <View style={styles.row}>
        <View style={styles.answer}>
          <Button
            label={submitting ? '…' : 'Yes'}
            variant="secondary"
            onPress={() => submit('resolved_yes')}
            disabled={submitting}
            testID="resolve-yes"
          />
        </View>
        <View style={styles.answer}>
          <Button
            label={submitting ? '…' : 'No'}
            variant="secondary"
            onPress={() => submit('resolved_no')}
            disabled={submitting}
            testID="resolve-no"
          />
        </View>
      </View>
      {/* Skip is not a peer of Yes and No: equal weight would make dodging a
          miss as cheap as recording it. Skips are excluded from the score,
          the streak and Wrapped alike, so the line below is true everywhere
          (DESIGN_SYSTEM §7.10, roadmap D10). */}
      <Pressable
        onPress={() => void submit('skipped')}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Can't tell / doesn't apply"
        accessibilityHint="It won't count toward your score."
        hitSlop={8}
        style={styles.skip}
        testID="resolve-skip"
      >
        <Text style={styles.skipText}>Can't tell / doesn't apply</Text>
        <Text style={styles.skipNote}>It won't count toward your score.</Text>
      </Pressable>
    </View>
  );
}

/** "3 Sep" in the user's locale. */
function formatLogged(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.lg, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    backgroundColor: colors.canvas,
  },
  stated: { ...type.title3, color: colors.textSecondary, marginBottom: space.md },
  statedNumber: {
    ...type.title1,
    ...tabularNums,
    fontFamily: roundedFamily,
    color: colors.textPrimary,
  },
  category: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: { ...type.title2, color: colors.textPrimary, marginBottom: space.xxl },
  question: { ...type.headline, color: colors.textPrimary, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  // Yes and No share the width equally.
  answer: { flex: 1 },
  skip: { alignItems: 'center', marginTop: space.lg, minHeight: 44, paddingVertical: space.sm },
  skipText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  skipNote: { ...type.footnote, color: colors.textSecondary, marginTop: space.xxs },
  recordedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
  },
  recorded: { ...type.headline, color: colors.textPrimary },
  bucketBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    marginBottom: space.xxl,
    padding: space.lg,
  },
  bucketLine: { ...type.callout, color: colors.textPrimary },
  changeAnswer: { alignSelf: 'center', marginTop: space.lg, paddingVertical: space.sm },
  again: { marginTop: space.sm },
  addReflection: { alignSelf: 'flex-start', marginBottom: space.lg, paddingVertical: space.sm },
  changeAnswerText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.xs,
  },
  error: { ...type.subhead, color: colors.destructive, marginBottom: space.md },
  notFoundTitle: { ...type.headline, color: colors.textPrimary, marginBottom: space.sm },
  notFoundBody: { ...type.subhead, color: colors.textSecondary, textAlign: 'center' },
  skippedBody: { marginBottom: space.lg },
});

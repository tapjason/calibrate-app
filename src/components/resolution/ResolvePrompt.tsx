import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, roundedFamily, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import type { Prediction, ResolvedStatus } from '@/types';

interface ResolvePromptProps {
  /** Prediction id read from the URL or notification payload. */
  predictionId: string;
  /** Called after a successful resolve. */
  onResolved?: () => void;
}

/**
 * Renders the yes/no/skip prompt for a single prediction.
 *
 * The id arrives untrusted (URL or notification payload). predictionStore
 * .getById applies the current-user filter, so a crafted deep-link can't
 * surface another user's prediction once Supabase auth lands in L5.
 */
export function ResolvePrompt({ predictionId, onResolved }: ResolvePromptProps) {
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const submit = async (outcome: ResolvedStatus) => {
    if (!prediction) return;
    setError(null);
    setSubmitting(true);
    try {
      await usePredictionStore
        .getState()
        .resolve(prediction.id, outcome, reflection.trim() || undefined);
      onResolved?.();
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
      <Text style={styles.category}>{prediction.category}</Text>
      <Text style={styles.title}>{prediction.title}</Text>

      <TextField
        label="Reflection (optional)"
        value={reflection}
        onChangeText={setReflection}
        placeholder="What surprised you?"
        multiline
        maxLength={500}
        testID="reflection-field"
      />

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
        <Button
          label="Skip"
          variant="secondary"
          onPress={() => submit('skipped')}
          disabled={submitting}
          testID="resolve-skip"
        />
      </View>
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
    marginBottom: space.xs,
  },
  title: { ...type.title2, color: colors.textPrimary, marginBottom: space.xxl },
  question: { ...type.headline, color: colors.textPrimary, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  // Yes and No share the width equally; Skip takes only what it needs.
  answer: { flex: 1 },
  error: { ...type.subhead, color: colors.destructive, marginBottom: space.md },
  notFoundTitle: { ...type.headline, color: colors.textPrimary, marginBottom: space.sm },
  notFoundBody: { ...type.subhead, color: colors.textSecondary, textAlign: 'center' },
});

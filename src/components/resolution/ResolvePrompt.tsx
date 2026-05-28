import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
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
      <Text style={styles.eyebrow}>{prediction.category} · {prediction.confidence}%</Text>
      <Text style={styles.title}>{prediction.title}</Text>

      <TextField
        label="Reflection (optional)"
        value={reflection}
        onChangeText={setReflection}
        placeholder="What did you notice?"
        multiline
        maxLength={500}
        testID="reflection-field"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.row}>
        <Button
          label={submitting ? '…' : 'Yes'}
          onPress={() => submit('resolved_yes')}
          disabled={submitting}
          testID="resolve-yes"
        />
        <Button
          label={submitting ? '…' : 'No'}
          variant="danger"
          onPress={() => submit('resolved_no')}
          disabled={submitting}
          testID="resolve-no"
        />
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

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  eyebrow: { fontSize: 13, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 20, color: '#111827' },
  row: { flexDirection: 'row', gap: 8 },
  error: { color: '#dc2626', marginBottom: 12 },
  notFoundTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  notFoundBody: { color: '#6b7280', textAlign: 'center' },
});

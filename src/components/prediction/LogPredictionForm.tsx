import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { refinePrediction } from '@/ai/refine';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { usePredictionStore } from '@/store/predictionStore';
import type { Category } from '@/types';

const CATEGORIES: readonly Category[] = [
  'work',
  'health',
  'finance',
  'social',
  'personal',
];

const TITLE_MAX_LENGTH = 200;

interface LogPredictionFormProps {
  /** Called after a successful create. Used by the screen to navigate away. */
  onSubmitted?: () => void;
}

export function LogPredictionForm({ onSubmitted }: LogPredictionFormProps) {
  // Presets are frozen at mount: regenerating them every render would change
  // the ISO strings each tick and break chip-selection comparison below.
  const [presets, setPresets] = useState(datePresets);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('work');
  const [confidence, setConfidence] = useState(50);
  const [dueDate, setDueDate] = useState(presets[1].iso);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const onRefine = async () => {
    // Fire-and-forget by design: per CLAUDE.md, refine must never block the
    // save flow. A null result silently leaves the user's text untouched.
    setSuggestion(null);
    setRefining(true);
    try {
      const result = await refinePrediction(title);
      if (result && result !== title.trim()) {
        setSuggestion(result);
      }
    } finally {
      setRefining(false);
    }
  };

  const acceptSuggestion = () => {
    if (suggestion) {
      setTitle(suggestion);
      setSuggestion(null);
    }
  };

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await usePredictionStore.getState().create({
        title,
        category,
        confidence,
        due_date: dueDate,
      });
      setTitle('');
      setConfidence(50);
      const next = datePresets();
      setPresets(next);
      setDueDate(next[1].iso);
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <TextField
        label="Prediction"
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          if (suggestion) setSuggestion(null);
        }}
        placeholder="e.g. I'll ship 3 priority tasks before Friday"
        maxLength={TITLE_MAX_LENGTH}
        testID="title-field"
      />

      <View style={styles.refineRow}>
        <Pressable
          onPress={onRefine}
          disabled={refining || title.trim().length === 0}
          testID="refine-button"
          style={({ pressed }) => [
            styles.refineButton,
            (refining || title.trim().length === 0) && styles.refineDisabled,
            pressed && styles.refinePressed,
          ]}
        >
          <Text style={styles.refineLabel}>
            {refining ? 'Refining…' : '✨ Refine'}
          </Text>
        </Pressable>
      </View>

      {suggestion && (
        <View style={styles.suggestion} testID="refine-suggestion">
          <Text style={styles.suggestionLabel}>Suggested rewrite</Text>
          <Text style={styles.suggestionText}>{suggestion}</Text>
          <View style={styles.suggestionActions}>
            <Button
              label="Use this"
              onPress={acceptSuggestion}
              testID="refine-accept"
            />
            <Button
              label="Dismiss"
              variant="secondary"
              onPress={() => setSuggestion(null)}
              testID="refine-dismiss"
            />
          </View>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.row}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              testID={`category-${c}`}
              style={[styles.chip, category === c && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  category === c && styles.chipTextActive,
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Confidence: {confidence}%</Text>
        <View style={styles.row}>
          <Button
            label="−5"
            variant="secondary"
            onPress={() => setConfidence((v) => Math.max(0, v - 5))}
            testID="confidence-decrement"
          />
          <Button
            label="+5"
            variant="secondary"
            onPress={() => setConfidence((v) => Math.min(100, v + 5))}
            testID="confidence-increment"
          />
        </View>
        {confidence >= 35 && confidence <= 65 && (
          <Text style={styles.bonus}>
            ✨ Integrity bonus — honest uncertainty
          </Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Due date</Text>
        <View style={styles.row}>
          {presets.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => setDueDate(preset.iso)}
              testID={`due-${preset.label}`}
              style={[
                styles.chip,
                dueDate === preset.iso && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  dueDate === preset.iso && styles.chipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.dateValue}>{new Date(dueDate).toLocaleDateString()}</Text>
      </View>

      {error && <Text style={styles.error} testID="log-error">{error}</Text>}

      <Button
        label={submitting ? 'Saving…' : 'Save prediction'}
        onPress={onSubmit}
        disabled={submitting}
        testID="submit-button"
      />
    </View>
  );
}

function datePresets(): { label: string; iso: string }[] {
  // Add days in LOCAL time so "tomorrow" means the user's tomorrow, not
  // UTC's. Anchor at noon local so the resulting UTC timestamp falls on
  // the same calendar date for every timezone between UTC-12 and UTC+12.
  const make = (daysAhead: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  return [
    { label: 'tomorrow', iso: make(1) },
    { label: '+1 week', iso: make(7) },
    { label: '+1 month', iso: make(30) },
  ];
}

const styles = StyleSheet.create({
  block: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#374151', fontWeight: '500' },
  chipTextActive: { color: 'white' },
  bonus: { marginTop: 8, color: '#059669', fontSize: 13 },
  dateValue: { marginTop: 8, color: '#374151' },
  error: { color: '#dc2626', marginBottom: 12 },
  refineRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  refineButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  refinePressed: { opacity: 0.7 },
  refineDisabled: { opacity: 0.4 },
  refineLabel: { color: '#6d28d9', fontWeight: '600', fontSize: 13 },
  suggestion: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6d28d9',
    marginBottom: 4,
  },
  suggestionText: { fontSize: 15, color: '#1f2937', marginBottom: 12 },
  suggestionActions: { flexDirection: 'row', gap: 8 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import {
  MAX_WARMUP_CONFIDENCE,
  MIN_WARMUP_CONFIDENCE,
  selectCurrentQuestion,
  useWarmupStore,
} from '@/store/warmupStore';

const STEP = 5;

// Mid-scale, not the floor. Starting at 50 would anchor everyone to "coin
// flip" and flatten the very spread the Warmup exists to reveal; starting at
// the midpoint of the 50–100 range lets people move in either direction.
const DEFAULT_CONFIDENCE = 75;

/**
 * The Warmup quiz: one binary question at a time with a stated confidence.
 *
 * There is deliberately no right/wrong reveal between questions. The whole
 * quiz is meant to take about a minute (CLAUDE.md Warmup Module), and a
 * per-question reveal both doubles the taps and lets people recalibrate
 * mid-run — which would blunt the verdict. The answer key lands all at once
 * on the result screen instead.
 */
export function WarmupQuiz() {
  const question = useWarmupStore(selectCurrentQuestion);
  const index = useWarmupStore((s) => s.index);
  const total = useWarmupStore((s) => s.questions.length);
  const answer = useWarmupStore((s) => s.answer);

  const [selected, setSelected] = useState<0 | 1 | null>(null);
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE);
  const [submitting, setSubmitting] = useState(false);

  if (!question) return null;

  const onNext = async () => {
    if (selected === null || submitting) return;
    setSubmitting(true);
    try {
      await answer(selected, confidence);
      // Reset for the next question. Confidence resets too: carrying it over
      // would quietly anchor every later answer to the first one.
      setSelected(null);
      setConfidence(DEFAULT_CONFIDENCE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap} testID="warmup-quiz">
      <Text style={styles.progress}>
        Question {index + 1} of {total}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${(index / total) * 100}%` }]}
        />
      </View>

      <Text style={styles.prompt}>{question.prompt}</Text>

      <View style={styles.options}>
        {question.options.map((option, i) => (
          <Pressable
            key={option}
            testID={`warmup-option-${i}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === i }}
            onPress={() => setSelected(i as 0 | 1)}
            style={[styles.option, selected === i && styles.optionActive]}
          >
            <Text
              style={[
                styles.optionText,
                selected === i && styles.optionTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>How sure are you? {confidence}%</Text>
        <Text style={styles.hint}>
          50% is a coin flip — there are only two options.
        </Text>
        <View style={styles.row}>
          <Button
            label="−5"
            variant="secondary"
            testID="warmup-confidence-decrement"
            onPress={() =>
              setConfidence((v) => Math.max(MIN_WARMUP_CONFIDENCE, v - STEP))
            }
          />
          <Button
            label="+5"
            variant="secondary"
            testID="warmup-confidence-increment"
            onPress={() =>
              setConfidence((v) => Math.min(MAX_WARMUP_CONFIDENCE, v + STEP))
            }
          />
        </View>
      </View>

      <Button
        label={index + 1 === total ? 'See my result' : 'Next'}
        testID="warmup-next"
        disabled={selected === null || submitting}
        onPress={onNext}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  progress: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  progressTrack: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: '#2563eb', height: 4 },
  prompt: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  options: { gap: 10 },
  option: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  optionActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  optionText: { color: '#111827', fontSize: 16 },
  optionTextActive: { color: '#1d4ed8', fontWeight: '600' },
  block: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  hint: { color: '#9ca3af', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
});

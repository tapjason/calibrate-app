import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { colors, type } from '@/constants/theme';
import {
  MAX_WARMUP_CONFIDENCE,
  MIN_WARMUP_CONFIDENCE,
  selectCurrentQuestion,
  useWarmupStore,
} from '@/store/warmupStore';

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
      {/* Segmented, one per question: answered, current, to come. */}
      <View
        style={styles.segments}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i < index && styles.segmentDone,
              i === index && styles.segmentCurrent,
            ]}
          />
        ))}
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
            {/* A radio mark carries the selection without colour. */}
            <View style={[styles.radio, selected === i && styles.radioOn]}>
              {selected === i && <View style={styles.radioDot} />}
            </View>
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
        <ConfidenceControl
          value={confidence}
          onChange={setConfidence}
          min={MIN_WARMUP_CONFIDENCE}
          max={MAX_WARMUP_CONFIDENCE}
          label="How sure are you?"
          hint="50% is a coin flip — there are only two options."
          idPrefix="warmup-confidence"
        />
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
  progress: { ...type.footnote, color: colors.textSecondary, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { backgroundColor: colors.hairline, borderRadius: 999, flex: 1, height: 6 },
  segmentDone: { backgroundColor: colors.brand600 },
  segmentCurrent: { backgroundColor: colors.brand200 },
  prompt: { ...type.title2 },
  options: { gap: 10 },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.controlBorder,
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOn: { borderColor: colors.brand600 },
  radioDot: { backgroundColor: colors.brand600, borderRadius: 999, height: 10, width: 10 },
  optionActive: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  optionText: { ...type.body, color: colors.textPrimary, flex: 1 },
  optionTextActive: { color: colors.brand700, fontWeight: '600' },
  block: { gap: 8 },
});

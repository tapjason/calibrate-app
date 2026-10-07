import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChoiceList } from '@/components/ui/ChoiceList';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { colors, space, type } from '@/constants/theme';
import {
  MAX_PRACTICE_CONFIDENCE,
  MIN_PRACTICE_CONFIDENCE,
  usePracticeStore,
} from '@/store/practiceStore';

interface PracticeQuizProps {
  day: number;
  slot: number;
}

/**
 * One of the day's practice questions, as the Warmup asks them: pick an
 * answer, then say how sure (50–100%, nothing preset, roadmap D13). Like the
 * Warmup, the answers land together at the end: three questions take half a
 * minute, and a reveal after each would double the taps.
 *
 * Keyed by slot by its parent, so each question starts with nothing chosen.
 */
export function PracticeQuiz({ day, slot }: PracticeQuizProps) {
  const questions = usePracticeStore.getState().questionsFor(day);
  const question = questions[slot];
  const total = questions.length;
  const [selected, setSelected] = useState<0 | 1 | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A new question replaces the last while focus stays on the button, so a
  // screen reader would never hear it (roadmap step 44). Say it.
  useEffect(() => {
    if (slot > 0 && question) {
      AccessibilityInfo.announceForAccessibility(`Question ${slot + 1} of ${total}. ${question.prompt}`);
    }
  }, [slot, total, question]);

  if (!question) return null;

  const onNext = async () => {
    if (selected === null || confidence === null || submitting) return;
    setSubmitting(true);
    try {
      await usePracticeStore.getState().answer(day, slot, selected, confidence);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap} testID="practice-quiz">
      <View
        style={styles.segments}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {questions.map((q, i) => (
          <View
            key={q.id}
            style={[styles.segment, i < slot && styles.segmentDone, i === slot && styles.segmentCurrent]}
          />
        ))}
      </View>
      <Text style={styles.progress} aria-hidden accessibilityElementsHidden>
        Question {slot + 1} of {total}
      </Text>
      <Text
        style={styles.prompt}
        accessibilityRole="header"
        accessibilityLabel={`Question ${slot + 1} of ${total}. ${question.prompt}`}
        testID="practice-prompt"
      >
        {question.prompt}
      </Text>

      <ChoiceList
        label={question.prompt}
        options={question.options}
        selected={selected}
        onSelect={setSelected}
        idPrefix="practice-option"
      />

      <ConfidenceControl
        value={confidence}
        onChange={setConfidence}
        min={MIN_PRACTICE_CONFIDENCE}
        max={MAX_PRACTICE_CONFIDENCE}
        label="How sure are you?"
        hint="50% is a coin flip: there are only two options."
        idPrefix="practice-confidence"
      />

      <Button
        label={slot + 1 === total ? 'See answers' : 'Next'}
        testID="practice-next"
        disabled={selected === null || confidence === null || submitting}
        onPress={onNext}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  segments: { flexDirection: 'row', gap: space.xs },
  segment: { backgroundColor: colors.hairline, borderRadius: 999, flex: 1, height: 6 },
  segmentDone: { backgroundColor: colors.brand600 },
  segmentCurrent: { backgroundColor: colors.brand200 },
  progress: { ...type.footnote, color: colors.textSecondary, fontWeight: '600', marginTop: -space.sm },
  prompt: { ...type.title2, color: colors.textPrimary },
});

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChoiceList } from '@/components/ui/ChoiceList';
import { ConfidenceControl, TWO_CHOICE_HINT } from '@/components/ui/ConfidenceControl';
import { colors, space, type } from '@/constants/theme';
import {
  MAX_PRACTICE_CONFIDENCE,
  MIN_PRACTICE_CONFIDENCE,
  usePracticeStore,
} from '@/store/practiceStore';

interface PracticeQuizProps {
  day: number;
  slot: number;
  /**
   * Bring this content offset (the bottom of Next) into view, if it's out of
   * sight. Called once an answer is picked: at 320 × 568 Next sat below the
   * fold (blind playtest 2026-11-09b, finding 16), as the Warmup's confidence
   * once did (WarmupQuiz `pick`).
   */
  reveal?: (bottom: number) => void;
}

/**
 * One of the day's practice questions, as the Warmup asks them: pick an
 * answer, then say how sure (0–100% since the owner's call of 2026-11-23, a
 * number under 50 taken as said; nothing preset, roadmap D13). Like the
 * Warmup, the answers land together at the end: three questions take half a
 * minute, and a reveal after each would double the taps.
 *
 * Keyed by slot by its parent, so each question starts with nothing chosen.
 */
export function PracticeQuiz({ day, slot, reveal }: PracticeQuizProps) {
  const questions = usePracticeStore.getState().questionsFor(day);
  const question = questions[slot];
  const total = questions.length;
  const [selected, setSelected] = useState<0 | 1 | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Positions kept from layout events, not measured: where this quiz sits in
  // the scroll content, and where Next sits in the quiz.
  const wrapY = useRef(0);
  const nextBox = useRef({ y: 0, height: 0 });
  const pick = (choice: 0 | 1) => {
    setSelected(choice);
    if (nextBox.current.height > 0) {
      reveal?.(wrapY.current + nextBox.current.y + nextBox.current.height);
    }
  };

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
    <View
      style={styles.wrap}
      testID="practice-quiz"
      onLayout={(e) => {
        wrapY.current = e.nativeEvent.layout.y;
      }}
    >
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
        onSelect={pick}
        idPrefix="practice-option"
      />

      <ConfidenceControl
        value={confidence}
        onChange={setConfidence}
        min={MIN_PRACTICE_CONFIDENCE}
        max={MAX_PRACTICE_CONFIDENCE}
        label="How sure are you?"
        // The Warm-up's line without its tap tip (voice pass, 2026-11-23).
        hint={TWO_CHOICE_HINT}
        idPrefix="practice-confidence"
      />

      <View
        testID="practice-next-box"
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          nextBox.current = { y, height };
        }}
      >
        <Button
          label={slot + 1 === total ? 'See answers' : 'Next'}
          testID="practice-next"
          disabled={selected === null || confidence === null || submitting}
          onPress={onNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  segments: { flexDirection: 'row', gap: space.xs },
  segment: { backgroundColor: colors.hairline, borderRadius: 999, flex: 1, height: 6 },
  segmentDone: { backgroundColor: colors.action },
  // controlBorder (≥ 3:1 on the canvas), between the ink of the answered steps
  // and the hairline of those to come: emphasis was too close to hairline (D33).
  segmentCurrent: { backgroundColor: colors.controlBorder },
  progress: { ...type.footnote, color: colors.textSecondary, fontWeight: '600', marginTop: -space.sm },
  prompt: { ...type.title2, color: colors.textPrimary },
});

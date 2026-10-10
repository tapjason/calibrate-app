import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChoiceList } from '@/components/ui/ChoiceList';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { colors, space, type } from '@/constants/theme';
import {
  MAX_WARMUP_CONFIDENCE,
  MIN_WARMUP_CONFIDENCE,
  selectCurrentQuestion,
  useWarmupStore,
} from '@/store/warmupStore';

/**
 * The Warmup quiz: one binary question at a time with a stated confidence.
 *
 * There is deliberately no right/wrong reveal between questions. The whole
 * quiz is meant to take about a minute (CLAUDE.md Warmup Module), and a
 * per-question reveal both doubles the taps and lets people recalibrate
 * mid-run — which would blunt the verdict. The answer key lands all at once
 * on the result screen instead.
 */
interface WarmupQuizProps {
  /** Shown above the first question only (the route's intro). */
  intro?: ReactNode;
  /** The way out, under Next. Omitted, there's none. */
  onSkip?: () => void;
}

/*
 * Next is pinned under the scrolling question (2026-10-09): two blind testers
 * had to scroll to find it on the first question, at 375 × 667 and 320 × 568,
 * and on the later ones the scroll they'd kept hid the progress bar. Each
 * question opens at its top.
 */
export function WarmupQuiz({ intro, onSkip }: WarmupQuizProps = {}) {
  const question = useWarmupStore(selectCurrentQuestion);
  const index = useWarmupStore((s) => s.index);
  const total = useWarmupStore((s) => s.questions.length);
  const answer = useWarmupStore((s) => s.answer);

  const [selected, setSelected] = useState<0 | 1 | null>(null);
  // Nothing preset (roadmap D13). It used to start at 75%, so tapping straight
  // through produced "75% sure, 50% right" on the first share card: a verdict
  // on our number, not the person's.
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Next swaps the question in place while focus stays on the button, so a
  // screen reader would never hear the new one (roadmap step 44). Say it.
  const firstQuestion = useRef(true);
  useEffect(() => {
    if (firstQuestion.current) {
      firstQuestion.current = false;
      return;
    }
    if (question) {
      AccessibilityInfo.announceForAccessibility(
        `Question ${index + 1} of ${total}. ${question.prompt}`,
      );
    }
  }, [index, total, question]);

  if (!question) return null;

  const onNext = async () => {
    if (selected === null || confidence === null || submitting) return;
    setSubmitting(true);
    try {
      await answer(selected, confidence);
      // Reset for the next question. Confidence resets too: carrying it over
      // would quietly anchor every later answer to the first one.
      setSelected(null);
      setConfidence(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView key={index} contentContainerStyle={styles.scroll}>
        {index === 0 && intro}
        <View style={styles.wrap} testID="warmup-quiz">
          {/* Said as part of the question heading below, so not twice. */}
          <Text style={styles.progress} aria-hidden accessibilityElementsHidden>
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

          <Text
            style={styles.prompt}
            accessibilityRole="header"
            accessibilityLabel={`Question ${index + 1} of ${total}. ${question.prompt}`}
            testID="warmup-prompt"
          >
            {question.prompt}
          </Text>

          <ChoiceList
            label={question.prompt}
            options={question.options}
            selected={selected}
            onSelect={setSelected}
            idPrefix="warmup-option"
          />

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

        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={index + 1 === total ? 'See my result' : 'Next'}
          testID="warmup-next"
          disabled={selected === null || confidence === null || submitting}
          onPress={onNext}
        />
        {/* An escape hatch, because this route replaces the stack: without it
            the only way out is answering all ten. A text button, so it doesn't
            compete with Next (DESIGN_SYSTEM §7.20). */}
        {onSkip && (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.skip}
            testID="warmup-skip"
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { gap: 16, padding: 20, paddingBottom: space.lg },
  footer: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.sm,
    paddingHorizontal: 20,
    paddingTop: space.md,
  },
  skip: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  skipText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  wrap: { gap: 16 },
  progress: { ...type.footnote, color: colors.textSecondary, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { backgroundColor: colors.hairline, borderRadius: 999, flex: 1, height: 6 },
  segmentDone: { backgroundColor: colors.brand600 },
  segmentCurrent: { backgroundColor: colors.brand200 },
  prompt: { ...type.title2, color: colors.textPrimary },
  block: { gap: 8 },
});

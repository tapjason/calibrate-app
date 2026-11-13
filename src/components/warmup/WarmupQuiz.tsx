import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChoiceList } from '@/components/ui/ChoiceList';
import { ConfidenceControl } from '@/components/ui/ConfidenceControl';
import { usePinnedFooter } from '@/components/ui/usePinnedFooter';
import { useScrollReveal } from '@/components/ui/useScrollReveal';
import { colors, space, type } from '@/constants/theme';
import {
  MAX_WARMUP_CONFIDENCE,
  MIN_WARMUP_CONFIDENCE,
  selectCurrentQuestion,
  useWarmupStore,
} from '@/store/warmupStore';

/** Said on the first questions only (roadmap D60 (g)). */
export const WARMUP_TAP_TIP = 'Tap anywhere on the bar to jump to a number.';
const WARMUP_TAP_TIP_QUESTIONS = 3;

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
  const { pinned, onFooterLayout } = usePinnedFooter();
  const savePick = useWarmupStore((s) => s.setPick);

  // From what was kept, so a reload or an interruption doesn't lose this
  // question's pick (blind playtest 2026-11-12c, finding 19).
  const [selected, setSelected] = useState<0 | 1 | null>(
    () => useWarmupStore.getState().pick?.option ?? null,
  );
  // Nothing preset (roadmap D13). It used to start at 75%, so tapping straight
  // through produced "75% sure, 50% right" on the first share card: a verdict
  // on our number, not the person's.
  const [confidence, setConfidence] = useState<number | null>(
    () => useWarmupStore.getState().pick?.confidence ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest option and number, for the delayed save: a value captured at
  // the drag could overwrite an option tapped after it (code review
  // 2026-11-12).
  const latest = useRef({ selected, confidence });
  latest.current = { selected, confidence };
  useEffect(
    () => () => {
      if (pickTimer.current) clearTimeout(pickTimer.current);
    },
    [],
  );

  // On the first question at 375 × 667 the intro pushes the confidence control
  // below the fold, and two blind playtests (2026-11-01, 2026-11-03) found it
  // only by scrolling. Once an answer is picked, bring the control into view if
  // it's out of sight, no further than needed, without motion under Reduce
  // Motion. Positions are kept from layout and scroll events, not measured
  // (useScrollReveal). The block sits inside the quiz's wrap, hence nested.
  const reveal = useScrollReveal({ nested: true });
  // The ScrollView is keyed by question, so each one opens at the top: forget
  // the last question's offset, or a needed scroll could be skipped.
  const shownIndex = useRef(index);
  const resetReveal = reveal.reset;
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    resetReveal();
  }, [index, resetReveal]);
  // A question that opens with a kept pick shows it: after a reload the kept
  // number sat under Next and Skip, and read as lost again (blind playtest
  // 2026-11-12e, finding 4). Once, as soon as the layout is known.
  const restored = useRef(selected !== null || confidence !== null);
  const revealRestored = reveal.reveal;
  useEffect(() => {
    if (!restored.current) return;
    restored.current = false;
    revealRestored();
  }, [revealRestored]);
  const pick = (choice: 0 | 1) => {
    setSelected(choice);
    if (pickTimer.current) clearTimeout(pickTimer.current);
    void savePick(choice, latest.current.confidence);
    reveal.reveal();
  };

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
    const choice = selected;
    const sure = confidence;
    // Reset for the next question. Confidence resets too: carrying it over
    // would quietly anchor every later answer to the first one. Before the
    // answer, which now waits on a save (kept progress, playtest 2026-11-09b):
    // after it, a frame could show the next question with this one's answer.
    setSelected(null);
    setConfidence(null);
    // A number still waiting to be kept belongs to this question, now answered.
    if (pickTimer.current) clearTimeout(pickTimer.current);
    try {
      await answer(choice, sure);
    } finally {
      setSubmitting(false);
    }
  };

  // Pinned under the question unless that would take over a quarter of the
  // screen (large text on a small phone): then it ends the scroll.
  const footer = (
    <View style={[styles.footer, !pinned && styles.footerInline]} onLayout={onFooterLayout}>
      <View style={styles.footerButtons}>
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
            // Not upward: Skip's reach went into Next (blind playtest
            // 2026-11-12, finding 10).
            hitSlop={{ top: 0, bottom: 8, left: 8, right: 8 }}
            style={styles.skip}
            testID="warmup-skip"
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        key={index}
        ref={reveal.scrollRef}
        contentContainerStyle={styles.scroll}
        onLayout={reveal.onViewportLayout}
        onScroll={reveal.onScroll}
        onScrollBeginDrag={reveal.onScrollBeginDrag}
        scrollEventThrottle={32}
      >
        {index === 0 && intro}
        <View
          style={styles.wrap}
          testID="warmup-quiz"
          onLayout={reveal.onParentLayout}
        >
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
            onSelect={pick}
            idPrefix="warmup-option"
          />

          <View
            style={styles.block}
            testID="warmup-confidence-block"
            onLayout={reveal.onTargetLayout}
          >
            <ConfidenceControl
              value={confidence}
              onChange={(value) => {
                setConfidence(value);
                // A drag sends many values: keep the one it settles on.
                if (pickTimer.current) clearTimeout(pickTimer.current);
                pickTimer.current = setTimeout(
                  () => void savePick(latest.current.selected, latest.current.confidence),
                  300,
                );
              }}
              min={MIN_WARMUP_CONFIDENCE}
              max={MAX_WARMUP_CONFIDENCE}
              label="How sure are you?"
              // The first three say a tap on the bar sets any number: with ±5
              // alone a question cost 7–9 taps, and a stylus user gave up at
              // question 3 (blind playtest 2026-11-13b, runs 4 and 8; D60).
              hint={
                index < WARMUP_TAP_TIP_QUESTIONS
                  ? `50% is a coin flip: there are only two options. ${WARMUP_TAP_TIP}`
                  : '50% is a coin flip: there are only two options.'
              }
              idPrefix="warmup-confidence"
            />
          </View>

        </View>
        {!pinned && footer}
      </ScrollView>

      {pinned && footer}
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
  // In the scroll: the same width as pinned (out through the scroll's
  // padding), so its height, which decides where it goes, doesn't change.
  // Next and Skip touched (blind playtest 2026-11-12, finding 10).
  footerButtons: { gap: space.sm },
  footerInline: { marginHorizontal: -20, marginBottom: -space.lg },
  skip: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  skipText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
  wrap: { gap: 16 },
  progress: { ...type.footnote, color: colors.textSecondary, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { backgroundColor: colors.hairline, borderRadius: 999, flex: 1, height: 6 },
  segmentDone: { backgroundColor: colors.action },
  // controlBorder (≥ 3:1 on the canvas), between the ink of the answered steps
  // and the hairline of those to come: emphasis was too close to hairline (D33).
  segmentCurrent: { backgroundColor: colors.controlBorder },
  prompt: { ...type.title2, color: colors.textPrimary },
  block: { gap: 8 },
});

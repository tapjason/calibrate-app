import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { track } from '@/analytics/track';

import { PracticeQuiz } from '@/components/practice/PracticeQuiz';
import { PracticeReminderOffer } from '@/components/practice/PracticeReminderOffer';
import { PracticeResult } from '@/components/practice/PracticeResult';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';

/**
 * Today's practice (roadmap step 88), as a full-height sheet from Today's
 * row: three questions, then the answers and the record so far. The day is
 * fixed when the sheet opens, so a practice started before midnight finishes
 * on the questions it began with.
 */
export default function PracticeScreen() {
  const router = useRouter();
  const [day] = useState(() => usePracticeStore.getState().today());
  const slot = usePracticeStore((s) => s.nextSlot(day));

  // The denominator for practice completion (research/retention-2026-10.md
  // §4): a sheet opened on a day with nothing answered yet. Once per open.
  useEffect(() => {
    if (usePracticeStore.getState().answersFor(day).length === 0) void track('practice_started');
  }, [day]);

  // Next out of sight once an answer is picked: scroll no further than needed,
  // without motion under Reduce Motion (playtest 2026-11-09b, finding 16).
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const scrollY = useRef(0);
  // A new question is a new ScrollView, at its top.
  useEffect(() => {
    scrollY.current = 0;
  }, [slot]);
  const reveal = (bottom: number) => {
    const target = bottom + space.lg;
    if (viewportHeight.current > 0 && target > scrollY.current + viewportHeight.current) {
      scrollRef.current?.scrollTo({ y: target - viewportHeight.current, animated: !reduceMotion });
    }
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Today’s practice
        </Text>
        <CloseButton onPress={close} testID="practice-close" />
      </View>
      {/* Keyed on the half showing and the question, so the answers open at
          their top after a quiz that was scrolled to reach its button
          (roadmap step 72). */}
      <ScrollView
        // Each question opens at its top: one scrolled down to reveal Next
        // kept that offset for the next question (review, 2026-11-09).
        key={slot === null ? 'result' : `quiz-${slot}`}
        ref={scrollRef}
        contentContainerStyle={styles.wrap}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
      >
        {slot === null ? (
          <PracticeResult day={day}>
            {/* "Same time tomorrow?" (roadmap step 89). Native only. */}
            <PracticeReminderOffer />
          </PracticeResult>
        ) : (
          <PracticeQuiz key={slot} day={day} slot={slot} reveal={reveal} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  title: { ...type.title2, color: colors.textPrimary },
  wrap: { padding: space.lg, paddingBottom: space.huge },
});

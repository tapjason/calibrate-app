import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';

import { PracticeQuiz } from '@/components/practice/PracticeQuiz';
import { PracticeResult } from '@/components/practice/PracticeResult';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';

/**
 * Today's practice (roadmap step 88), called "trivia" on screen since
 * 2026-11-25 (the owner), as a full-height sheet from Today's row: three
 * questions, then the answers and the record so far. The day is fixed when
 * the sheet opens, so a practice started before midnight finishes on the
 * questions it began with.
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
  // `bottom` is in the scroll content's coordinates: PracticeQuiz adds its own
  // y in its parent, the content container, which counts the header row and
  // the gap above the quiz. So the quiz stays a direct child of the scroll
  // view, after the header.
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
    // Share's shape (app/share/index.tsx), which works on the phone: the
    // scroll view is the only child, and the title and × scroll inside it.
    // react-native-screens on the New Architecture resizes a formSheet's
    // scroll view to the whole sheet and can lay it at the top, over a header
    // beside it (docs/app-profile.md §18): on build 1.0.0 (8) the progress bar
    // sat on the title and the × couldn't be tapped (owner, 2026-11-21).
    <SafeAreaView style={styles.sheet} edges={['top']}>
      {/* Keyed on the half showing and the question, so the answers open at
          their top after a quiz that was scrolled to reach its button
          (roadmap step 72). */}
      <ScrollView
        // Each question opens at its top: one scrolled down to reveal Next
        // kept that offset for the next question (review, 2026-11-09). The
        // header remounts with it, which is fine.
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
        testID="practice-scroll"
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Today’s trivia
          </Text>
          <CloseButton onPress={close} testID="practice-close" />
        </View>
        {slot === null ? (
          <PracticeResult day={day} />
        ) : (
          <PracticeQuiz key={slot} day={day} slot={slot} reveal={reveal} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.canvas, flex: 1 },
  // The gaps the sheet had with the header beside the scroll view: space.lg
  // above the title and at the sides, and space.lg between it and the quiz.
  wrap: { gap: space.lg, padding: space.lg, paddingBottom: space.huge },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
  },
  // Shrinks and wraps at a large text size, so the × stays on screen.
  title: { ...type.title2, color: colors.textPrimary, flexShrink: 1 },
});

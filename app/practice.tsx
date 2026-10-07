import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { track } from '@/analytics/track';

import { PracticeQuiz } from '@/components/practice/PracticeQuiz';
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
      {/* Keyed on the half showing, so the answers open at their top after a
          quiz that was scrolled to reach its button (roadmap step 72). */}
      <ScrollView key={slot === null ? 'result' : 'quiz'} contentContainerStyle={styles.wrap}>
        {slot === null ? (
          <PracticeResult day={day} />
        ) : (
          <PracticeQuiz key={slot} day={day} slot={slot} />
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

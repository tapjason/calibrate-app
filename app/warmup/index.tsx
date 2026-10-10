import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';

import { WarmupQuiz } from '@/components/warmup/WarmupQuiz';
import { WarmupVerdictScreen } from '@/components/warmup/WarmupVerdict';
import { colors, type } from '@/constants/theme';
import { selectCurrentQuestion, useWarmupStore } from '@/store/warmupStore';

/**
 * Onboarding. Ten estimation questions, then an immediate calibration verdict
 * — the Day-0 aha, before the user has a single real prediction on file.
 *
 * Thin by convention: which half to show is a store read, and "continue"
 * hands off to Today with the Log sheet open, so the very next thing they do
 * is the core loop.
 */
export default function WarmupScreen() {
  const router = useRouter();
  const question = useWarmupStore(selectCurrentQuestion);
  const finished = question === null;

  // Denominator of D0 aha completion (GROWTH §7): everyone who reached the
  // quiz, against the warmup_completed events. Fired on mount rather than on
  // the first answer, because someone who opens the quiz and leaves is exactly
  // who that metric is about.
  useEffect(() => {
    if (!finished) void track('warmup_started');
    // Deliberately once per mount, not per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reached via first-run redirect, and the root Stack draws no header, so
  // this route insets its own edges: the top, and the bottom for Next.
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {finished ? (
        // Its own scroll view, so the verdict opens at its top: sharing the
        // quiz's, it once kept the quiz's offset and opened on the chart.
        <ScrollView key="verdict" contentContainerStyle={styles.wrap}>
          <WarmupVerdictScreen
            // Log is a sheet now (roadmap D3): put Today underneath first, so
            // the sheet has somewhere to close back to.
            onContinue={() => {
              router.replace('/' as never);
              router.push('/log' as never);
            }}
            onShare={() => router.push('/share' as never)}
          />
        </ScrollView>
      ) : (
        <WarmupQuiz
          // Shown on the first question only: repeated on all ten it kept
          // Next below the fold on a 667pt phone.
          intro={
            <View style={styles.intro}>
              <Text style={styles.brand}>Calibrate · 60-second warm-up</Text>
              <Text style={styles.title} accessibilityRole="header">
                How well do you know what you know?
              </Text>
              <Text style={styles.body}>
                Pick an answer, then say how sure you are. Knowing how sure to be
                is the skill.
              </Text>
            </View>
          }
          // An escape hatch, because this route replaces the stack. Without it
          // the only way out is answering all ten questions, which turns any
          // mis-fire of the first-run redirect into a user locked away from
          // their own data.
          onSkip={() => router.replace('/' as never)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 16, padding: 20, paddingBottom: 40 },
  intro: { gap: 8 },
  brand: { ...type.eyebrow, color: colors.brandText, fontWeight: '700' },
  title: { ...type.title1, color: colors.textPrimary, fontWeight: '800' },
  body: { ...type.subhead, color: colors.textSecondary },
});

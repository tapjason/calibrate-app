import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';

import { WarmupQuiz } from '@/components/warmup/WarmupQuiz';
import { WarmupVerdictScreen } from '@/components/warmup/WarmupVerdict';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/theme';
import { selectCurrentQuestion, useWarmupStore } from '@/store/warmupStore';

/**
 * Onboarding. Ten estimation questions, then an immediate calibration verdict
 * — the Day-0 aha, before the user has a single real prediction on file.
 *
 * Thin by convention: which half to show is a store read, and "continue"
 * hands off to the Log screen so the very next thing they do is the core loop.
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
  // this route insets its own top edge.
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        {!finished && (
          <View style={styles.intro}>
            <Text style={styles.brand}>Calibrate · 60-second warm-up</Text>
            <Text style={styles.title}>How well do you know what you know?</Text>
            <Text style={styles.body}>
              Ten quick questions. Pick an answer, then say how sure you are.
              Being right matters less than knowing how right you are.
            </Text>
          </View>
        )}
        {finished ? (
          <WarmupVerdictScreen
            onContinue={() => router.replace('/log' as never)}
            onShare={() => router.push('/share' as never)}
          />
        ) : (
          <>
            <WarmupQuiz />
            {/* An escape hatch, because this route replaces the stack. Without
                it the only way out is answering all ten questions, which turns
                any mis-fire of the first-run redirect into a user locked away
                from their own data. */}
            <Button
              label="Skip for now"
              variant="secondary"
              testID="warmup-skip"
              onPress={() => router.replace('/' as never)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 24, padding: 20, paddingBottom: 40 },
  intro: { gap: 8 },
  brand: { color: colors.brandText, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
});

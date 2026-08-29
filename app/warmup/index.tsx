import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WarmupQuiz } from '@/components/warmup/WarmupQuiz';
import { WarmupVerdictScreen } from '@/components/warmup/WarmupVerdict';
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

  // Reached via first-run redirect, and the root Stack draws no header, so
  // this route insets its own top edge.
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        {!finished && (
          <View style={styles.intro}>
            <Text style={styles.title}>Before you start</Text>
            <Text style={styles.body}>
              Ten quick questions. Pick an answer, then say how sure you are.
              Being right matters less than knowing how right you are.
            </Text>
          </View>
        )}
        {finished ? (
          <WarmupVerdictScreen onContinue={() => router.replace('/log' as never)} />
        ) : (
          <WarmupQuiz />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 24, padding: 20, paddingBottom: 40 },
  intro: { gap: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { color: '#6b7280', fontSize: 15, lineHeight: 21 },
});

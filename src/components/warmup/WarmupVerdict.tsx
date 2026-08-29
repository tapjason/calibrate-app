import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { Button } from '@/components/ui/Button';
import { useWarmupStore } from '@/store/warmupStore';
import { MIN_N_OVERALL } from '@/types';

import { warmupVerdict } from './verdictCopy';

interface WarmupVerdictScreenProps {
  /** Continue into the app. The screen owns the navigation. */
  onContinue: () => void;
}

/**
 * The Day-0 payoff: the verdict, the mini calibration curve, and the answer
 * key. This is the first thing that makes the app's premise concrete, and the
 * first shareable moment.
 *
 * Note the disclaimer below the score. The Warmup number is real, but it is
 * not the user's calibration rating — that one stays provisional until
 * MIN_N_OVERALL real resolutions. Saying so here keeps the "never present a
 * number built on noise" principle intact while still delivering the aha.
 */
export function WarmupVerdictScreen({ onContinue }: WarmupVerdictScreenProps) {
  const result = useWarmupStore((s) => s.result);
  const answers = useWarmupStore((s) => s.answers);
  const questions = useWarmupStore((s) => s.questions);
  const verdict = warmupVerdict(result);

  if (!result || !verdict) return null;

  return (
    <View style={styles.wrap} testID="warmup-verdict">
      <Text style={styles.eyebrow}>Your warm-up</Text>
      <Text style={styles.title}>{verdict.title}</Text>
      <Text style={styles.detail}>{verdict.detail}</Text>

      <View style={styles.scoreRow}>
        <Text style={styles.score}>{Math.round(result.mini_score)}</Text>
        <View style={styles.scoreMeta}>
          <Text style={styles.scoreLabel}>Warm-up calibration</Text>
          <Text style={styles.scoreSub}>out of 100</Text>
        </View>
      </View>

      <CalibrationChart buckets={result.buckets} />

      <Text style={styles.advice}>{verdict.advice}</Text>

      <Text style={styles.disclaimer}>
        This is a warm-up score, not your calibration rating. That one unlocks
        after {MIN_N_OVERALL} resolved predictions of your own.
      </Text>

      <View style={styles.key}>
        <Text style={styles.keyTitle}>The answers</Text>
        {questions.map((q, i) => {
          const answered = answers[i];
          if (!answered) return null;
          return (
            <View key={q.id} style={styles.keyRow} testID={`warmup-key-${q.id}`}>
              <Text style={styles.keyMark}>{answered.correct ? '✓' : '✗'}</Text>
              <View style={styles.keyBody}>
                <Text style={styles.keyPrompt}>
                  {q.prompt} {q.options[q.correctIndex]}
                </Text>
                <Text style={styles.keyFact}>{q.fact}</Text>
              </View>
              <Text style={styles.keyConfidence}>{answered.confidence}%</Text>
            </View>
          );
        })}
      </View>

      <Button
        label="Log my first prediction"
        testID="warmup-continue"
        onPress={onContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  eyebrow: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { fontSize: 26, fontWeight: '700' },
  detail: { color: '#4b5563', fontSize: 16, lineHeight: 22 },
  scoreRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  score: { color: '#2563eb', fontSize: 48, fontWeight: '800' },
  scoreMeta: { gap: 2 },
  scoreLabel: { fontSize: 15, fontWeight: '600' },
  scoreSub: { color: '#9ca3af', fontSize: 13 },
  advice: { color: '#374151', fontSize: 15, lineHeight: 21 },
  disclaimer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  key: { gap: 12, marginTop: 4 },
  keyTitle: { fontSize: 16, fontWeight: '700' },
  keyRow: { flexDirection: 'row', gap: 10 },
  keyMark: { fontSize: 15, fontWeight: '700', width: 16 },
  keyBody: { flex: 1, gap: 2 },
  keyPrompt: { fontSize: 14, fontWeight: '600' },
  keyFact: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  keyConfidence: { color: '#9ca3af', fontSize: 13 },
});

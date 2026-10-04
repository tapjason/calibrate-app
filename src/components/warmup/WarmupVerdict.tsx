import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { Button } from '@/components/ui/Button';
import { colors, type } from '@/constants/theme';
import { useWarmupStore } from '@/store/warmupStore';
import { MIN_N_OVERALL } from '@/types';

import { warmupVerdict } from './verdictCopy';

interface WarmupVerdictScreenProps {
  /** Continue into the app. The screen owns the navigation. */
  onContinue: () => void;
  /** Open the share surface, where this result is the Day-0 card. */
  onShare?: () => void;
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
export function WarmupVerdictScreen({ onContinue, onShare }: WarmupVerdictScreenProps) {
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

      <CalibrationChart buckets={result.buckets} animateIn />

      <Text style={styles.advice}>{verdict.advice}</Text>

      <Text style={styles.disclaimer}>
        This is a warm-up score, not your calibration rating. That one unlocks
        after {MIN_N_OVERALL} resolved predictions of your own.
      </Text>

      {/* Actions before the answer key: the key is a long read, and the two
          things to do next shouldn't sit below it. */}
      <View style={styles.actions}>
        <Button
          label="Log my first prediction"
          testID="warmup-continue"
          onPress={onContinue}
        />
        {/* The first shareable moment (CLAUDE.md, Warmup module). */}
        {onShare && (
          <Button
            label="Share my result"
            variant="secondary"
            testID="warmup-share"
            onPress={onShare}
          />
        )}
      </View>

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

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  eyebrow: { ...type.eyebrow, color: colors.textSecondary },
  title: { ...type.title1 },
  detail: { ...type.callout, color: colors.textSecondary },
  scoreRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  // Ink, not brand: colour goes to direction, never to the score (§2.4).
  // title1, not display: a warm-up score must not look like the real rating
  // (DESIGN_SYSTEM §7.2 / baseline 02). The verdict sentence is the headline.
  score: { ...type.title1, color: colors.textPrimary, fontWeight: '800' },
  scoreMeta: { gap: 2 },
  scoreLabel: { ...type.subhead, fontWeight: '600' },
  scoreSub: { ...type.footnote, color: colors.textTertiary },
  advice: { ...type.subhead, color: colors.textSecondary },
  disclaimer: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    ...type.footnote,
    color: colors.textSecondary,
    padding: 12,
  },
  actions: { gap: 10 },
  key: { gap: 12, marginTop: 4 },
  keyTitle: { ...type.headline },
  keyRow: { flexDirection: 'row', gap: 10 },
  keyMark: { ...type.subhead, fontWeight: '700', width: 16 },
  keyBody: { flex: 1, gap: 2 },
  keyPrompt: { ...type.subhead, fontWeight: '600' },
  keyFact: { ...type.footnote, color: colors.textSecondary },
  keyConfidence: { ...type.footnote, color: colors.textTertiary },
});

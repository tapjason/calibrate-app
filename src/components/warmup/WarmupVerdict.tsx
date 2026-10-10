import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, type } from '@/constants/theme';
import { useWarmupStore } from '@/store/warmupStore';
import { MIN_N_OVERALL } from '@/types';

import { answerKeyRow, warmupVerdict } from './verdictCopy';

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
 * No 0–100 number (roadmap D19, decided 2026-10-09): ten answers can't
 * separate a calibrated person from one 15 points off, so a score here would
 * be the "number built on noise" CLAUDE.md rules out. The counts lead, and the
 * chart shows them.
 */
export function WarmupVerdictScreen({ onContinue, onShare }: WarmupVerdictScreenProps) {
  const result = useWarmupStore((s) => s.result);
  const answers = useWarmupStore((s) => s.answers);
  const questions = useWarmupStore((s) => s.questions);
  const verdict = warmupVerdict(result, answers);

  if (!result || !verdict) return null;

  return (
    <View style={styles.wrap} testID="warmup-verdict">
      <Text style={styles.eyebrow}>Your warm-up</Text>
      <Text style={styles.title}>{verdict.title}</Text>
      <Text style={styles.detail}>{verdict.detail}</Text>

      <CalibrationChart buckets={result.buckets} animateIn />

      <Text style={styles.advice}>{verdict.advice}</Text>
      {verdict.sameNumber && (
        <Text style={styles.advice} testID="warmup-same-number">
          {verdict.sameNumber}
        </Text>
      )}

      {/* The bridge (roadmap D18 (3)): trivia is the warm-up, plans are where
          overconfidence lives (Buehler, Griffin & Ross 1994: 33.9 days
          predicted, 55.5 taken). */}
      <Text style={styles.advice} testID="warmup-bridge">
        Trivia is the warm-up. People are most overconfident about their own plans:
        students who expected to finish their thesis in 34 days took 56. Make your
        first one about tomorrow.
      </Text>

      <Text style={styles.disclaimer}>
        This is a warm-up, not your calibration rating. That one needs{' '}
        {MIN_N_OVERALL} of your own predictions.
      </Text>

      {/* Actions before the answer key: the key is a long read, and the two
          things to do next shouldn't sit below it. */}
      <View style={styles.actions}>
        <Button
          // One line at 320pt; "Predict something about tomorrow" wrapped to
          // two, ragged inside the capsule. The bridge above says "tomorrow".
          label="Make a real prediction"
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
          const row = answerKeyRow(q, answered);
          // One stop per question for a screen reader, in words; the glyph is
          // shape, not colour: filled for right, hollow for a miss (§2.4).
          return (
            <View
              key={q.id}
              style={styles.keyRow}
              testID={`warmup-key-${q.id}`}
              accessible
              accessibilityRole="text"
              accessibilityLabel={row.spoken}
            >
              <Icon
                sf={answered.correct ? 'checkmark.circle.fill' : 'xmark.circle'}
                fallback={answered.correct ? 'checkmark-circle' : 'close-circle-outline'}
                size={18}
                color={colors.textPrimary}
              />
              <View style={styles.keyBody}>
                <Text style={styles.keyPrompt}>{q.prompt}</Text>
                <Text style={styles.keyAnswer} testID={`warmup-key-${q.id}-answer`}>
                  {row.answer} · <Text style={styles.keyPick}>{row.pick}</Text>
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
  title: { ...type.title1, color: colors.textPrimary },
  detail: { ...type.callout, color: colors.textSecondary },
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
  keyTitle: { ...type.headline, color: colors.textPrimary },
  keyRow: { flexDirection: 'row', gap: 10 },
  keyBody: { flex: 1, gap: 2 },
  keyPrompt: { ...type.subhead, color: colors.textSecondary },
  keyAnswer: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  keyPick: { fontWeight: '400' },
  keyFact: { ...type.footnote, color: colors.textSecondary },
  keyConfidence: { ...type.footnote, color: colors.textTertiary },
});

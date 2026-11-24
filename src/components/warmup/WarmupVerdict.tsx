import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/constants/theme';
import { useWarmupStore } from '@/store/warmupStore';

import { AnswerKeyRow } from './AnswerKeyRow';
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
      <Text accessibilityRole="header" style={styles.title}>
        {verdict.title}
      </Text>
      <Text style={styles.detail}>{verdict.detail}</Text>
      {/* What the verdict means in counts ("You expected about 7 and got 7")
          or what to do next, straight under it: below the chart it sat three
          screens down at large text, and a screen reader heard both buttons
          first (blind playtest 2026-11-12f, finding 2; step 173). */}
      <Text style={styles.advice} testID="warmup-expected">
        {verdict.advice}
      </Text>

      {/* The bridge (roadmap D18 (3)): trivia is the warm-up, plans are where
          overconfidence lives. The study behind it (Buehler, Griffin & Ross
          1994: 33.9 days predicted, 55.5 taken) is in How scoring works since
          the voice pass (2026-11-23). */}
      <Text style={styles.advice} testID="warmup-bridge">
        That was the warm-up. The real thing is your own plans, where people are most
        overconfident. Start with one about tomorrow.
      </Text>

      {/* The bridge and the two things to do next right under the counts
          (2026-10-09): below the chart and its notes they sat about 1.4
          screens down, and three blind testers scrolled to find them. The
          chart, the notes and the answer key are for whoever wants more. */}
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

      {/* The best line in the app sat two taps deep in How scoring works
          (blind playtest 2026-11-01, run 1); the result is where it's needed
          first (roadmap D36). */}
      <Text style={styles.advice} testID="warmup-not-right">
        It isn’t about being right. If you say 60%, about 4 in 10 should miss.
      </Text>

      {/* No caption note since the voice pass (2026-11-23): "The read above
          takes all ten together…" was cut with the text load, and so were the
          one-number note and the "not your calibration rating" box under the
          chart (Today says the 20). */}
      <CalibrationChart
        buckets={result.buckets}
        animateIn
        // Its ten answers never fill a range, so the chart's own rule (a
        // range with 10) would never name the zones. They're named when the
        // headline names a lean, and not over "no clear lean", where two dots
        // in the "Underconfident" corner contradicted it (blind playtest
        // 2026-11-14, run 1; code review of step 181).
        zoneWords={result.direction !== 'calibrated'}
      />

      <View style={styles.key}>
        <Text accessibilityRole="header" style={styles.keyTitle}>
          The answers
        </Text>
        {questions.map((q, i) => {
          const answered = answers[i];
          if (!answered) return null;
          return (
            <AnswerKeyRow key={q.id} question={q} answer={answered} testID={`warmup-key-${q.id}`} />
          );
        })}
      </View>

      {/* The way on again at the end: after the ten answers, the button was
          a long scroll back up (blind playtest 2026-11-12e, finding 14). */}
      <View style={styles.endAction}>
        <Button
          label="Make a real prediction"
          testID="warmup-continue-end"
          onPress={onContinue}
        />
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
  actions: { gap: 10 },
  key: { gap: 12, marginTop: 4 },
  keyTitle: { ...type.headline, color: colors.textPrimary },
  endAction: { marginTop: space.sm },
});

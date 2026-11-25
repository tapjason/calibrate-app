import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { holdRanges } from '@/components/ui/holdRanges';
import { AnswerKeyRow } from '@/components/warmup/AnswerKeyRow';
import { colors, radius, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';

import { PRACTICE_APART, practiceDayCopy, practiceRecordCopy } from './practiceCopy';

interface PracticeResultProps {
  day: number;
}

/**
 * The day's practice, answered: what it came to in counts, the answer key in
 * the Warmup's form, and everything practised so far. The record says which
 * way the answers lean only from PRACTICE_MIN_N, and draws the chart from
 * there too; before that it says how many more it takes.
 */
export function PracticeResult({ day }: PracticeResultProps) {
  usePracticeStore((s) => s.answers);
  const store = usePracticeStore.getState();
  const answers = store.answersFor(day);
  const dayCopy = practiceDayCopy(store.dayTally(day));
  const record = store.record();
  const recordCopy = practiceRecordCopy(record);

  return (
    <View style={styles.wrap} testID="practice-result">
      <View accessible accessibilityRole="text" accessibilityLabel={`${dayCopy.title}. ${dayCopy.detail}`}>
        <Text style={styles.title} testID="practice-result-title">
          {dayCopy.title}
        </Text>
        <Text style={styles.detail} testID="practice-result-detail">
          {dayCopy.detail}
        </Text>
      </View>

      <View style={styles.key}>
        {/* The Warm-up's rows, stacking at large text alike (blind playtest
            2026-11-12e, finding 12). */}
        {answers.map((a) => (
          <AnswerKeyRow
            key={a.slot}
            question={a.question}
            answer={{ confidence: a.confidence, correct: a.correct }}
            testID={`practice-key-${a.slot}`}
          />
        ))}
      </View>

      <Text style={styles.tomorrow} testID="practice-tomorrow">
        Three new questions tomorrow.
      </Text>

      <View style={styles.record} testID="practice-record">
        <Text style={styles.eyebrow} accessibilityRole="header">
          Your trivia so far
        </Text>
        {/* It names ranges by the chart's rule now (record audit
            2026-11-23), held whole at a line break as Insights' title is. */}
        <Text style={styles.recordHeadline} testID="practice-record-headline">
          {holdRanges(recordCopy.headline)}
        </Text>
        <Text style={styles.recordDetail} testID="practice-record-detail">
          {recordCopy.detail}
        </Text>
        {record.buckets.length > 0 && <CalibrationChart buckets={record.buckets} />}
        <Text style={styles.apart}>{PRACTICE_APART}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  // title1, not display: practice must not look like the real rating (§7.18).
  title: { ...type.title1, color: colors.textPrimary },
  detail: { ...type.callout, color: colors.textSecondary },
  // The Warmup's answer key, row for row, so the two read as one thing.
  key: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.lg,
    padding: space.lg,
  },
  tomorrow: { ...type.subhead, color: colors.textSecondary },
  record: { gap: space.sm },
  eyebrow: { ...type.eyebrow, color: colors.textSecondary },
  recordHeadline: { ...type.headline, color: colors.textPrimary },
  recordDetail: { ...type.subhead, color: colors.textSecondary },
  apart: { ...type.footnote, color: colors.textTertiary },
});

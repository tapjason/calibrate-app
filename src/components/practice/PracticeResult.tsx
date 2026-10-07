import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { Icon } from '@/components/ui/Icon';
import { answerKeyRow } from '@/components/warmup/verdictCopy';
import { colors, radius, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';

import { PRACTICE_APART, practiceDayCopy, practiceRecordCopy } from './practiceCopy';

interface PracticeResultProps {
  day: number;
  /** Shown under the day's answers: the reminder offer (roadmap step 89). */
  children?: ReactNode;
}

/**
 * The day's practice, answered: what it came to in counts, the answer key in
 * the Warmup's form, and everything practised so far. The record says which
 * way the answers lean only from PRACTICE_MIN_N, and draws the chart from
 * there too; before that it says how many more it takes.
 */
export function PracticeResult({ day, children }: PracticeResultProps) {
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
        {answers.map((a) => {
          const row = answerKeyRow(a.question, { confidence: a.confidence, correct: a.correct });
          // One stop per question; the glyph is shape, not colour (§2.4).
          return (
            <View
              key={a.slot}
              style={styles.keyRow}
              testID={`practice-key-${a.slot}`}
              accessible
              accessibilityRole="text"
              accessibilityLabel={row.spoken}
            >
              <Icon
                sf={a.correct ? 'checkmark.circle.fill' : 'xmark.circle'}
                fallback={a.correct ? 'checkmark-circle' : 'close-circle-outline'}
                size={18}
                color={colors.textPrimary}
              />
              <View style={styles.keyBody}>
                <Text style={styles.keyPrompt}>{a.question.prompt}</Text>
                <Text style={styles.keyAnswer}>
                  {row.answer} · <Text style={styles.keyPick}>{row.pick}</Text>
                </Text>
                <Text style={styles.keyFact}>{a.question.fact}</Text>
              </View>
              <Text style={styles.keyConfidence}>{a.confidence}%</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.tomorrow} testID="practice-tomorrow">
        Three new questions tomorrow.
      </Text>

      {children}

      <View style={styles.record} testID="practice-record">
        <Text style={styles.eyebrow} accessibilityRole="header">
          Your practice so far
        </Text>
        <Text style={styles.recordHeadline} testID="practice-record-headline">
          {recordCopy.headline}
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
  keyRow: { flexDirection: 'row', gap: 10 },
  keyBody: { flex: 1, gap: space.xxs },
  keyPrompt: { ...type.subhead, color: colors.textSecondary },
  keyAnswer: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  keyPick: { fontWeight: '400' },
  keyFact: { ...type.footnote, color: colors.textSecondary },
  keyConfidence: { ...type.footnote, color: colors.textTertiary },
  tomorrow: { ...type.subhead, color: colors.textSecondary },
  record: { gap: space.sm },
  eyebrow: { ...type.eyebrow, color: colors.textSecondary },
  recordHeadline: { ...type.headline, color: colors.textPrimary },
  recordDetail: { ...type.subhead, color: colors.textSecondary },
  apart: { ...type.footnote, color: colors.textTertiary },
});

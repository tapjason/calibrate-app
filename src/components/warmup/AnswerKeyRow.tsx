import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, space, type } from '@/constants/theme';
import type { WarmupAnswer, WarmupQuestion } from '@/types';

import { ANSWER_KEY_GAP, ANSWER_KEY_ICON, answerKeyStacks } from './answerKeyLayout';
import { prefersUsUnits, withUsUnits } from './answerKeyUnits';
import { answerKeyRow } from './verdictCopy';

interface AnswerKeyRowProps {
  question: WarmupQuestion;
  answer: WarmupAnswer;
  /** The row's; its answer line gets `${testID}-answer`. */
  testID: string;
}

// Read once: the phone's region doesn't change mid-session in practice.
const US_UNITS = prefersUsUnits();

/**
 * One row of an answer key, the Warm-up's and practice's alike: the tick, the
 * question, the right answer and the pick, the fact, and the stated percent.
 * At large text sizes the tick and percent go on a line above the text, which
 * then has the whole row (blind playtest 2026-11-12e, finding 12). A screen
 * reader hears the same one sentence either way.
 */
export function AnswerKeyRow({ question, answer, testID }: AnswerKeyRowProps) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const stacked = answerKeyStacks(width, fontScale);
  const row = answerKeyRow(question, answer);
  // The glyph is shape, not colour: filled for right, hollow for a miss (§2.4).
  const tick = (
    <Icon
      sf={answer.correct ? 'checkmark.circle.fill' : 'xmark.circle'}
      fallback={answer.correct ? 'checkmark-circle' : 'close-circle-outline'}
      size={ANSWER_KEY_ICON}
      color={colors.textPrimary}
    />
  );
  const percent = <Text style={styles.confidence}>{answer.confidence}%</Text>;
  const text = (
    <View style={stacked ? styles.bodyStacked : styles.body}>
      <Text style={styles.prompt}>{question.prompt}</Text>
      <Text style={styles.answer} testID={`${testID}-answer`}>
        {row.sentence} <Text style={styles.pick}>{row.pick}</Text>
      </Text>
      <Text style={styles.fact}>{US_UNITS ? withUsUnits(question.fact) : question.fact}</Text>
    </View>
  );
  // One stop per question for a screen reader, in words.
  return (
    <View
      style={stacked ? styles.rowStacked : styles.row}
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={US_UNITS ? row.spoken.replace(question.fact, withUsUnits(question.fact)) : row.spoken}
      // The row's width comes from its parent, not its content, so stacking
      // can't change it and flip the layout back.
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {stacked ? (
        <>
          <View style={styles.marks} testID={`${testID}-marks`}>
            {tick}
            {percent}
          </View>
          {text}
        </>
      ) : (
        <>
          {tick}
          {text}
          {percent}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: ANSWER_KEY_GAP },
  rowStacked: { gap: space.xs },
  marks: { alignItems: 'center', flexDirection: 'row', gap: ANSWER_KEY_GAP },
  body: { flex: 1, gap: space.xxs },
  // No flex in a column: flex 1 there can squash the text to nothing
  // (docs/app-profile.md §18).
  bodyStacked: { gap: space.xxs },
  prompt: { ...type.subhead, color: colors.textSecondary },
  answer: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  pick: { fontWeight: '400' },
  fact: { ...type.footnote, color: colors.textSecondary },
  confidence: { ...type.footnote, color: colors.textTertiary },
});

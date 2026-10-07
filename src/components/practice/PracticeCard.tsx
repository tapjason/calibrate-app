import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';

import { practiceCardCopy } from './practiceCopy';

interface PracticeCardProps {
  onOpen: () => void;
  testID?: string;
}

/**
 * Today's practice on Today (roadmap step 88): one row, like the streak's,
 * saying what's waiting, how far it got, or what it came to. The whole row
 * opens the practice sheet (DESIGN_SYSTEM §7.21: no capsule hiding inside a
 * row). Real predictions resolve when they come due, which the person doesn't
 * choose, so this is the reason to open the app on a day when nothing is due.
 */
export function PracticeCard({ onOpen, testID = 'practice-card' }: PracticeCardProps) {
  // Subscribed so the row follows each answer; the day is read at render, and
  // Today re-renders when the day turns (useLocalDay).
  usePracticeStore((s) => s.answers);
  const store = usePracticeStore.getState();
  const day = store.today();
  const total = store.questionsFor(day).length;
  if (total === 0) return null;
  const copy = practiceCardCopy(store.dayTally(day), total);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={copy.spoken}
      accessibilityHint={copy.action}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon
        sf={copy.done ? 'checkmark.circle.fill' : 'target'}
        fallback={copy.done ? 'checkmark-circle' : 'locate-outline'}
        size={18}
        color={colors.brand600}
      />
      <View style={styles.text}>
        <Text style={styles.title} testID={`${testID}-title`}>
          {copy.title}
        </Text>
        <Text style={styles.detail} testID={`${testID}-detail`}>
          {copy.detail}
        </Text>
      </View>
      {/* Done, the row's chevron is enough: "See answers" crowded the count
          onto a second line at 375pt. It stays in the spoken hint. */}
      {!copy.done && (
        <Text style={styles.action} testID={`${testID}-action`}>
          {copy.action}
        </Text>
      )}
      <Icon sf="chevron.right" fallback="chevron-forward" size={14} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The streak row's shape, so the two read as a pair (StreakLine).
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.lg,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  text: { flex: 1 },
  title: { ...type.headline, color: colors.textPrimary },
  detail: { ...type.footnote, color: colors.textSecondary },
  action: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
});

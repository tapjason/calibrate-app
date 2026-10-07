import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';
import type { PracticeReminderTime } from '@/store/settingsStore';

import { MomentChips } from './MomentChips';

interface PracticeReminderOfferCardProps {
  onChoose: (time: PracticeReminderTime) => void;
  onDismiss: () => void;
  /** After a choice: "Set for 8:00 AM." */
  confirmation?: string | null;
  /** While the system alert is up. */
  busy?: boolean;
}

/**
 * The practice reminder, offered once a day's practice is done (roadmap step
 * 89): the moment someone has just finished is when "same time tomorrow?"
 * makes sense. The same quiet sunken card as the reminder prompt on Today,
 * with "Not now" as a real answer.
 */
export function PracticeReminderOfferCard({ onChoose, onDismiss, confirmation, busy }: PracticeReminderOfferCardProps) {
  if (confirmation) {
    return (
      <View style={styles.wrap} testID="practice-reminder-offer" accessible accessibilityRole="text">
        <Text style={styles.title} testID="practice-reminder-confirmation">
          {confirmation}
        </Text>
        <Text style={styles.body}>Change it or turn it off in You.</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap} testID="practice-reminder-offer">
      <Text style={styles.title}>Want tomorrow’s three at a set time?</Text>
      <Text style={styles.body}>
        Pick a moment in your day. One reminder then, only on days practice isn’t done.
      </Text>
      <MomentChips selected={null} onChoose={(t) => t && onChoose(t)} disabled={busy} testID="practice-reminder-moments" />
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.notNow}
        testID="practice-reminder-dismiss"
      >
        <Text style={styles.notNowText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  notNow: { alignSelf: 'flex-start', paddingVertical: space.sm },
  notNowText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
});

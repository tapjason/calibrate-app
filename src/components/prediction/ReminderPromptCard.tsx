import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/constants/theme';
import { reminderTimeLabel } from '@/notifications/practiceReminder';
import { useSettingsStore } from '@/store/settingsStore';

interface ReminderPromptCardProps {
  /** "Tue, Oct 6": when the first reminder would come, or null if none is ahead. */
  firstDue: string | null;
  onAllow: () => void;
  onDismiss: () => void;
  /** While the system alert is up. */
  busy?: boolean;
}

/**
 * The in-context ask for notification permission (roadmap step 38). It says
 * what the reminders are and when the first one would come, and only the tap
 * on "Turn on reminders" shows the system alert. Same quiet card as the
 * coverage nudge: sunken, a secondary button, and "Not now" as a real answer.
 */
export function ReminderPromptCard({ firstDue, onAllow, onDismiss, busy }: ReminderPromptCardProps) {
  // The person's own time since D38, not always the evening.
  const reminderAt = useSettingsStore((s) => s.dueReminderTime);
  return (
    <View style={styles.wrap} testID="reminder-prompt">
      <Text style={styles.title}>Want a reminder when it's due?</Text>
      <Text style={styles.body}>
        At {reminderTimeLabel(reminderAt)} on the day each prediction comes due, one nudge to
        say how it went{firstDue ? `, starting ${firstDue}` : ''}. And a quiet weekly summary.
        Nothing else.
      </Text>
      <View style={styles.actions}>
        <Button
          label={busy ? 'Asking…' : 'Turn on reminders'}
          variant="secondary"
          onPress={onAllow}
          disabled={busy}
          testID="reminder-prompt-allow"
        />
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.notNow}
          testID="reminder-prompt-dismiss"
        >
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    marginBottom: space.lg,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  // Wraps at 320pt, where "Turn on reminders" and "Not now" overran the card.
  actions: {
    alignItems: 'center',
    columnGap: space.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space.xs,
    rowGap: space.xs,
  },
  notNow: { paddingVertical: space.sm },
  notNowText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
});

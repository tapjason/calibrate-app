import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { localTime } from '@/constants/locale';
import { colors, radius, space, type } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';

interface ReminderPromptCardProps {
  onAllow: () => void;
  onDismiss: () => void;
  /** While the system alert is up. */
  busy?: boolean;
}

/**
 * The reminder's time for the card's question: "7 PM" on the hour on a
 * 12-hour clock, "7:30 PM" off it, and "19:00" on a 24-hour clock, where the
 * hour alone would read "19".
 */
export function nudgeTime(time: { hour: number; minute: number }): string {
  const at = new Date(2000, 0, 1, time.hour, time.minute);
  const full = localTime(at, { hour: 'numeric', minute: '2-digit' });
  if (time.minute !== 0) return full;
  const hourOnly = localTime(at, { hour: 'numeric' });
  return /\d$/.test(hourOnly.trim()) ? full : hourOnly;
}

/**
 * The in-context ask for notification permission (roadmap step 38). It asks
 * in the person's own time (D38) and names the weekly summary too, since one
 * permission covers both (D76, the voice pass, 2026-11-23: "Want a nudge at
 * 7 PM on the day it’s due?" then "Plus a quiet weekly summary. Nothing
 * else."). The summary only while its switch is on (policy review
 * 2026-11-23): with Weekly digest off in You, the body is "Nothing else."
 * Only the tap on "Turn on reminders" shows the system alert. Same quiet card
 * as the coverage nudge: sunken, a secondary button, and "Not now" as a real
 * answer.
 */
export function ReminderPromptCard({ onAllow, onDismiss, busy }: ReminderPromptCardProps) {
  // The person's own time since D38, not always the evening.
  const reminderAt = useSettingsStore((s) => s.dueReminderTime);
  // The digest's own switch (D31): the card promises only what will be sent.
  const digestOn = useSettingsStore((s) => s.digestEnabled);
  return (
    <View style={styles.wrap} testID="reminder-prompt">
      <Text style={styles.title} testID="reminder-prompt-title">
        Want a nudge at {nudgeTime(reminderAt)} on the day it’s due?
      </Text>
      <Text style={styles.body} testID="reminder-prompt-body">
        {digestOn ? 'Plus a quiet weekly summary. Nothing else.' : 'Nothing else.'}
      </Text>
      <View style={styles.actions}>
        <Button
          label={busy ? 'Asking…' : 'Turn on reminders'}
          variant="secondary"
          onSunken
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

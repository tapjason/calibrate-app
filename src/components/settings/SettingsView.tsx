import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Settings surface. Two device-local toggles backed by settingsStore:
 *   - Notifications — the single kill-switch for resolution reminders + the
 *     weekly digest. The L5 services react to this via store subscription.
 *   - AI Refine — shows/hides the ✨ Refine button on the Log screen.
 *   - Coach — the Plus-only AI insight surface on Stats. Off until the user
 *     turns it on, per COACH_AGENT.md §5.6.
 *
 * Pure presentation: reads + writes the store, no other logic. The setters
 * persist to AsyncStorage and swallow their own errors.
 */
export function SettingsView({
  onOpenPaywall,
}: { onOpenPaywall?: () => void } = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const aiRefineEnabled = useSettingsStore((s) => s.aiRefineEnabled);
  const setNotificationsEnabled = useSettingsStore(
    (s) => s.setNotificationsEnabled,
  );
  const setAiRefineEnabled = useSettingsStore((s) => s.setAiRefineEnabled);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const setCoachEnabled = useSettingsStore((s) => s.setCoachEnabled);
  const analyticsEnabled = useSettingsStore((s) => s.analyticsEnabled);
  const setAnalyticsEnabled = useSettingsStore((s) => s.setAnalyticsEnabled);

  return (
    <View style={styles.wrap}>
      {/*
        Subscription status lives at the top because it is also where a
        subscriber goes to restore a purchase after a reinstall — the paywall
        carries the Restore button, and this is the only permanent route to it
        for someone who has already paid.
      */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Calibrate Plus</Text>
          <Text style={styles.rowDescription}>
            {isPlus
              ? 'Active. Coach and advanced analytics are unlocked.'
              : 'Coach, advanced analytics, and extra card themes.'}
          </Text>
        </View>
        {onOpenPaywall && (
          <Button
            label={isPlus ? 'Manage' : 'See Plus'}
            variant="secondary"
            onPress={onOpenPaywall}
            testID="settings-plus"
          />
        )}
      </View>

      <ToggleRow
        label="Notifications"
        description="Resolution reminders on due dates and the Sunday weekly digest."
        value={notificationsEnabled}
        onValueChange={(v) => void setNotificationsEnabled(v)}
        testID="toggle-notifications"
      />

      <ToggleRow
        label="AI Refine"
        description="Show the ✨ Refine button to rewrite predictions for a clear yes/no."
        value={aiRefineEnabled}
        onValueChange={(v) => void setAiRefineEnabled(v)}
        testID="toggle-ai-refine"
      />

      <ToggleRow
        label="Coach (AI)"
        description="Plus only. Sends your calibration numbers — never your prediction text — to get written feedback."
        value={coachEnabled}
        onValueChange={(v) => void setCoachEnabled(v)}
        testID="toggle-coach"
      />

      <ToggleRow
        label="Anonymous usage stats"
        description="Counts of which features get used — never your predictions, reflections, or any text. Turning this off deletes what's queued."
        value={analyticsEnabled}
        onValueChange={(v) => void setAnalyticsEnabled(v)}
        testID="toggle-analytics"
      />
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: '#111827' },
  rowDescription: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});

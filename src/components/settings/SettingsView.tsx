import { StyleSheet, Switch, Text, View } from 'react-native';

import { useSettingsStore } from '@/store/settingsStore';

/**
 * Settings surface. Two device-local toggles backed by settingsStore:
 *   - Notifications — the single kill-switch for resolution reminders + the
 *     weekly digest. The L5 services react to this via store subscription.
 *   - AI Refine — shows/hides the ✨ Refine button on the Log screen.
 *
 * Pure presentation: reads + writes the store, no other logic. The setters
 * persist to AsyncStorage and swallow their own errors.
 */
export function SettingsView() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const aiRefineEnabled = useSettingsStore((s) => s.aiRefineEnabled);
  const setNotificationsEnabled = useSettingsStore(
    (s) => s.setNotificationsEnabled,
  );
  const setAiRefineEnabled = useSettingsStore((s) => s.setAiRefineEnabled);

  return (
    <View style={styles.wrap}>
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

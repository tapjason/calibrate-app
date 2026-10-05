import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { REFINE_ENABLED } from '@/constants/app';
import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Settings surface. At the top, the account row (sign in, or who you are and
 * sign out) — hidden on a build with no Supabase config, where accounts can't
 * exist. Then the device-local toggles backed by settingsStore:
 *   - Notifications — the single kill-switch for resolution reminders + the
 *     weekly digest. The L5 services react to this via store subscription.
 *   - AI Refine — shows/hides the ✨ Refine button on the Log screen. The
 *     row is hidden entirely while REFINE_ENABLED is false (the feature is
 *     cut from the first release); the stored preference survives.
 *   - Coach — the Plus-only AI insight surface on Stats. Off until the user
 *     turns it on, per COACH_AGENT.md §5.6.
 *
 * Pure presentation: reads + writes the store, no other logic. The setters
 * persist to AsyncStorage and swallow their own errors.
 */
export function SettingsView({
  onOpenPaywall,
  onOpenAccount,
  onOpenDelete,
}: {
  onOpenPaywall?: () => void;
  onOpenAccount?: () => void;
  onOpenDelete?: () => void;
} = {}) {
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
      <AccountRow onOpenAccount={onOpenAccount} />

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

      {/* Hidden while refine is cut from the release — a toggle for a button
          that doesn't exist is worse than no toggle. The stored preference is
          left untouched, so flipping REFINE_ENABLED back on restores whatever
          the user had chosen. */}
      {REFINE_ENABLED && (
        <ToggleRow
          label="AI Refine"
          description="Show the ✨ Refine button to rewrite predictions for a clear yes/no."
          value={aiRefineEnabled}
          onValueChange={(v) => void setAiRefineEnabled(v)}
          testID="toggle-ai-refine"
        />
      )}

      <ToggleRow
        label="Coach (AI)"
        // Guideline 5.1.2(i): name the third-party AI before anything is sent.
        // The switch itself is the explicit permission; it starts off.
        description="Plus only. When you ask for feedback, your calibration numbers — never your prediction text — go through our server to OpenAI, which writes it."
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

      {onOpenDelete && <DeleteRow onOpenDelete={onOpenDelete} />}
    </View>
  );
}

/**
 * The way out, at the bottom where destructive settings live. Apple requires
 * account deletion be easy to find in the app (Guideline 5.1.1(v)); a guest
 * gets the equivalent for data that only ever lived on this phone.
 */
function DeleteRow({ onOpenDelete }: { onOpenDelete: () => void }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return null;
  return (
    <Pressable
      onPress={onOpenDelete}
      accessibilityRole="button"
      style={styles.deleteRow}
      testID="settings-delete"
    >
      <Text style={styles.deleteLabel}>
        {status === 'authenticated' ? 'Delete account' : 'Erase all data on this device'}
      </Text>
    </Pressable>
  );
}

/**
 * Signed out: what that means for your data, and a way in. Signed in: who you
 * are, and a way out. Sign-out keeps local data under the account's id, so it
 * needs no confirmation — signing back in shows everything again.
 */
function AccountRow({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const accountsAvailable = useAuthStore((s) => s.accountsAvailable);
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const pending = useAuthStore((s) => s.pending);
  const signOut = useAuthStore((s) => s.signOut);

  if (!accountsAvailable) return null;

  if (status === 'authenticated') {
    return (
      <View style={styles.row} testID="settings-account">
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Account</Text>
          <Text style={styles.rowDescription}>
            {describeAccount(email)} Your predictions are backed up.
          </Text>
        </View>
        <Button
          label="Sign out"
          variant="secondary"
          disabled={pending}
          onPress={() => void signOut()}
          testID="settings-sign-out"
        />
      </View>
    );
  }

  return (
    <View style={styles.row} testID="settings-account">
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>Account</Text>
        <Text style={styles.rowDescription}>
          Not signed in. Your predictions live only on this phone.
        </Text>
      </View>
      {onOpenAccount && (
        <Button
          label="Sign in"
          variant="secondary"
          onPress={onOpenAccount}
          testID="settings-sign-in"
        />
      )}
    </View>
  );
}

/**
 * Sign in with Apple can hand over a private relay address that the user has
 * never seen, so it reads better as the method than as an address.
 */
function describeAccount(email: string | null): string {
  if (!email) return 'Signed in.';
  if (email.endsWith('@privaterelay.appleid.com')) return 'Signed in with Apple.';
  return `Signed in as ${email}.`;
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
      <Switch
        value={value}
        onValueChange={onValueChange}
        testID={testID}
        // Brand tint when on; a 3:1 grey track when off, so "off" still reads
        // as a control (DESIGN_SYSTEM §2.2 controlBorder).
        trackColor={{ true: colors.brand600, false: colors.controlBorder }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.controlBorder}
        {...{ activeThumbColor: colors.surface }}
      />
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
    borderBottomColor: colors.hairline,
  },
  rowText: { flex: 1, paddingRight: 16 },
  rowLabel: { ...type.callout, fontWeight: '500', color: colors.textPrimary },
  rowDescription: { ...type.footnote, color: colors.textSecondary, marginTop: 4 },
  deleteRow: { marginTop: 24, paddingVertical: 14 },
  deleteLabel: { ...type.callout, color: colors.destructive, fontWeight: '500' },
});

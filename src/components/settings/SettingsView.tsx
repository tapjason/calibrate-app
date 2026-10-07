import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PRIVACY_POLICY_URL, REFINE_ENABLED, TERMS_OF_USE_URL } from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import {
  askForReminders,
  reminderPermission,
  type ReminderPermission,
} from '@/notifications/permission';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * The You tab (roadmap D3): settings as a grouped inset list (DESIGN_SYSTEM
 * §7.21, roadmap step 80), as iOS Settings, Streaks and Todoist lay theirs
 * out. A row that opens something is the whole row, with a chevron and its
 * current value; an on/off row ends in a switch; nothing hides its target in
 * a capsule button inside the row.
 *
 *   - Account: sign in, or who you are and sign out. Hidden on a build with no
 *     Supabase config, where accounts can't exist.
 *   - Your card, then Calibrate Plus (also the permanent route to Restore).
 *   - Notifications: the single kill-switch for reminders and the digest.
 *   - AI Refine (hidden while REFINE_ENABLED is false), Coach, usage stats.
 *   - About: how scoring works, terms, privacy.
 *   - Erase all data / Delete account, alone at the bottom.
 *
 * Pure presentation: reads + writes the store, no other logic. The setters
 * persist and swallow their own errors.
 */
export function SettingsView({
  onOpenPaywall,
  onOpenAccount,
  onOpenDelete,
  onOpenScoring,
  onOpenCard,
}: {
  onOpenPaywall?: () => void;
  onOpenAccount?: () => void;
  onOpenDelete?: () => void;
  /** "How scoring works" (roadmap step 29). */
  onOpenScoring?: () => void;
  /** The share card (Share), one tap from the tab named after you. */
  onOpenCard?: () => void;
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
      <AccountGroup onOpenAccount={onOpenAccount} />

      {/*
        Plus sits high because it is also where a subscriber goes to restore a
        purchase after a reinstall: the paywall carries Restore, and this is
        the only permanent route to it for someone who has already paid.
      */}
      {(onOpenCard || onOpenPaywall) && (
        <Group
          footer={
            isPlus
              ? 'Active. Coach and advanced analytics are unlocked.'
              : 'Plus adds Coach, advanced analytics, and extra card themes. Your score, curve, badges and cards stay free.'
          }
        >
          {onOpenCard && <NavRow label="Your card" onPress={onOpenCard} testID="settings-card" />}
          {onOpenPaywall && (
            <NavRow
              label="Calibrate Plus"
              value={isPlus ? 'Active' : undefined}
              onPress={onOpenPaywall}
              testID="settings-plus"
            />
          )}
        </Group>
      )}

      <Group>
        <ToggleRow
          label="Notifications"
          description="A reminder on the evening each prediction comes due, and the Sunday weekly digest."
          value={notificationsEnabled}
          onValueChange={(v) => void setNotificationsEnabled(v)}
          testID="toggle-notifications"
        />
        <NotificationPermissionRow />
      </Group>

      <Group>
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
          // Not "anonymous": once you sign in, events are tied to the account
          // (APP_PRIVACY.md declares them linked), so the label mustn't say so.
          label="Usage stats"
          description="Counts of which features get used, sent only once you sign in — never your predictions, reflections, or any text. Turning this off deletes what's queued."
          value={analyticsEnabled}
          onValueChange={(v) => void setAnalyticsEnabled(v)}
          testID="toggle-analytics"
        />
      </Group>

      <AboutGroup onOpenScoring={onOpenScoring} />

      {onOpenDelete && <DeleteGroup onOpenDelete={onOpenDelete} />}
    </View>
  );
}

/** One inset card of rows, with an optional footer explaining them. */
function Group({ children, footer }: { children: ReactNode; footer?: string }) {
  return (
    <View style={styles.group}>
      <View style={styles.card}>{children}</View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

/**
 * A row that opens something: the whole row is the target, ending in its
 * current value (if any) and a chevron (HIG Lists: "use a disclosure
 * indicator"). A row that acts in place (Sign out, Erase) leaves the chevron
 * off and says what it does in its label's colour.
 */
function NavRow({
  label,
  value,
  onPress,
  chevron = true,
  tone = 'default',
  disabled,
  testID,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  chevron?: boolean;
  tone?: 'default' | 'action' | 'destructive';
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <Text
        style={[
          styles.rowLabel,
          styles.rowLabelFill,
          tone === 'action' && styles.rowLabelAction,
          tone === 'destructive' && styles.rowLabelDestructive,
        ]}
      >
        {label}
      </Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {chevron && (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon sf="chevron.right" fallback="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      )}
    </Pressable>
  );
}

/** How scoring works, the terms, and the privacy policy once it's hosted. */
function AboutGroup({ onOpenScoring }: { onOpenScoring?: () => void }) {
  const open = (url: string) => {
    openBrowserAsync(url).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[settings] could not open link:', e);
    });
  };
  return (
    <Group>
      {onOpenScoring && (
        <NavRow label="How scoring works" onPress={onOpenScoring} testID="settings-scoring" />
      )}
      {/* Guideline 5.1.1(i): the privacy policy easily reached in the app, not
          only in the listing (roadmap step 36). It appears once
          PRIVACY_POLICY_URL is set, the switch that lights up the paywall's
          link; the terms are Apple's standard EULA, which the paywall links
          too. */}
      {PRIVACY_POLICY_URL && (
        <NavRow
          label="Privacy policy"
          onPress={() => open(PRIVACY_POLICY_URL as string)}
          testID="settings-privacy-link"
        />
      )}
      <NavRow
        label="Terms of use"
        onPress={() => open(TERMS_OF_USE_URL)}
        testID="settings-terms-link"
      />
    </Group>
  );
}

/**
 * What the Notifications toggle can't say on its own (roadmap step 38): iOS
 * hasn't been asked yet, or has been told no. The app asks in context, so a
 * user who skipped Home's prompt can still allow reminders here, and one who
 * refused gets a way to the iOS setting. Rechecked on return to the app, so
 * a change made in iOS Settings shows at once. Nothing on web or once allowed.
 */
function NotificationPermissionRow() {
  const [permission, setPermission] = useState<ReminderPermission | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const current = await reminderPermission();
      if (live) setPermission(current);
    };
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (permission !== 'undetermined' && permission !== 'denied') return null;
  const asked = permission === 'denied';
  return (
    <View style={styles.permission} testID="settings-notification-permission">
      <Text style={styles.rowDescription}>
        {asked
          ? 'Notifications are off for Calibrate in iOS Settings, so reminders can’t reach you.'
          : 'iOS hasn’t been asked yet, so reminders can’t reach you.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        style={styles.permissionAction}
        onPress={() => {
          if (asked) {
            void Linking.openSettings();
            return;
          }
          void (async () => setPermission(await askForReminders()))();
        }}
        testID="settings-notification-permission-action"
      >
        <Text style={styles.rowLabelAction}>{asked ? 'Open Settings' : 'Allow reminders'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The way out, alone at the bottom where destructive settings live. Apple
 * requires account deletion be easy to find in the app (Guideline
 * 5.1.1(v)); a guest gets the equivalent for data that only ever lived on
 * this phone. It opens a confirmation, so the row itself is just red words.
 */
function DeleteGroup({ onOpenDelete }: { onOpenDelete: () => void }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return null;
  return (
    <Group>
      <NavRow
        label={status === 'authenticated' ? 'Delete account' : 'Erase all data on this device'}
        onPress={onOpenDelete}
        chevron={false}
        tone="destructive"
        testID="settings-delete"
      />
    </Group>
  );
}

/**
 * Signed out: a way in, and what being signed out means for your data.
 * Signed in: who you are, and a way out. Sign-out keeps local data under the
 * account's id, so it needs no confirmation: signing back in shows
 * everything again.
 */
function AccountGroup({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const accountsAvailable = useAuthStore((s) => s.accountsAvailable);
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const pending = useAuthStore((s) => s.pending);
  const signOut = useAuthStore((s) => s.signOut);

  if (!accountsAvailable) return null;

  if (status === 'authenticated') {
    return (
      <View testID="settings-account">
        <Group footer={`${describeAccount(email)} Your predictions are backed up.`}>
          <NavRow
            label="Sign out"
            onPress={() => void signOut()}
            chevron={false}
            tone="action"
            disabled={pending}
            testID="settings-sign-out"
          />
        </Group>
      </View>
    );
  }

  return (
    <View testID="settings-account">
      <Group footer="Not signed in. Your predictions live only on this phone.">
        {onOpenAccount ? (
          <NavRow label="Sign in" onPress={onOpenAccount} testID="settings-sign-in" />
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Account</Text>
          </View>
        )}
      </Group>
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
  // One switch element for the whole row (roadmap step 41): VoiceOver doesn't
  // attach nearby text to a bare Switch, so on its own it was an unnamed
  // "switch, on". The row carries the name, state and description; the
  // inner Switch is hidden from assistive tech and still works by touch.
  return (
    <Pressable
      style={styles.row}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      // The cross-platform prop as well: react-native-web maps this one.
      aria-checked={value}
      testID={`${testID}-row`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        testID={testID}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // Brand tint when on; a 3:1 grey track when off, so "off" still reads
        // as a control (DESIGN_SYSTEM §2.2 controlBorder).
        trackColor={{ true: colors.brand600, false: colors.controlBorder }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.controlBorder}
        {...{ activeThumbColor: colors.surface }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xxl, padding: space.lg, paddingBottom: space.huge },
  group: { gap: space.sm },
  // Inset grouped: one surface card per group on the canvas, rows divided by
  // hairlines (DESIGN_SYSTEM §7.21).
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: { ...type.footnote, color: colors.textSecondary, paddingHorizontal: space.lg },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  rowText: { flex: 1, paddingRight: space.sm },
  rowLabel: { ...type.callout, fontWeight: '500', color: colors.textPrimary },
  rowLabelFill: { flex: 1 },
  rowLabelAction: { ...type.callout, fontWeight: '600', color: colors.brandText },
  rowLabelDestructive: { color: colors.destructive },
  rowValue: { ...type.callout, color: colors.textSecondary },
  rowDescription: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  permission: {
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  permissionAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});

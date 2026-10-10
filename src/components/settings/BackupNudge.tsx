import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';

/** How long predictions sit on one phone, unbacked, before the card asks. */
export const BACKUP_NUDGE_AFTER_DAYS = 30;
/** How long "Not now" keeps it away. */
export const BACKUP_NUDGE_COOLDOWN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether Today asks to back up (roadmap D31): only on a build where accounts
 * exist, only for a guest, only once the oldest prediction on the phone is
 * BACKUP_NUDGE_AFTER_DAYS old, and not within the cooldown of a "Not now". A
 * tester five months in found "Your predictions live only on this phone" only
 * in You, and was alarmed.
 */
export function shouldShowBackupNudge(input: {
  accountsAvailable: boolean;
  signedIn: boolean;
  /** created_at of the oldest prediction here, or null with none. */
  oldestCreatedAt: string | null;
  dismissedAt: string | null;
  now: Date;
}): boolean {
  if (!input.accountsAvailable || input.signedIn || !input.oldestCreatedAt) return false;
  const age = input.now.getTime() - Date.parse(input.oldestCreatedAt);
  if (!(age >= BACKUP_NUDGE_AFTER_DAYS * DAY_MS)) return false;
  if (!input.dismissedAt) return true;
  return input.now.getTime() - Date.parse(input.dismissedAt) >= BACKUP_NUDGE_COOLDOWN_DAYS * DAY_MS;
}

/**
 * Today's quiet back-it-up card (DESIGN_SYSTEM §7.11): sunken like the
 * reminder card, a secondary Sign in and a real "Not now". Never before 30
 * days, never once signed in.
 */
export function BackupNudge({ onSignIn }: { onSignIn: () => void }) {
  const accountsAvailable = useAuthStore((s) => s.accountsAvailable);
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const pending = usePredictionStore((s) => s.pending);
  const resolved = usePredictionStore((s) => s.resolved);
  const dismissedAt = useSettingsStore((s) => s.backupNudgeDismissedAt);

  let oldest: string | null = null;
  for (const p of [...pending, ...resolved]) {
    if (oldest === null || p.created_at < oldest) oldest = p.created_at;
  }
  const show = shouldShowBackupNudge({
    accountsAvailable,
    signedIn,
    oldestCreatedAt: oldest,
    dismissedAt,
    now: new Date(),
  });
  if (!show) return null;

  return (
    <View style={styles.wrap} testID="backup-nudge">
      <Text style={styles.title}>Your predictions live only on this phone</Text>
      <Text style={styles.body}>Sign in to keep them if it's lost or replaced.</Text>
      <View style={styles.actions}>
        <Button label="Sign in" variant="secondary" onPress={onSignIn} testID="backup-nudge-sign-in" />
        <Pressable
          onPress={() => void useSettingsStore.getState().dismissBackupNudge()}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.notNow}
          testID="backup-nudge-dismiss"
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
  actions: { alignItems: 'center', flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  notNow: { paddingVertical: space.sm },
  notNowText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
});

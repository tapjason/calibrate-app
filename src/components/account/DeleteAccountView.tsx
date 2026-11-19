import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { appLocked } from '@/components/ui/appLocked';
// Asks once more before anything is deleted: a system alert on the phone,
// the browser's confirm on web (shared with sign-out in You since D69 (a)).
import { askToConfirm } from '@/components/ui/askToConfirm';
import { Button } from '@/components/ui/Button';
import { APP_NAME, PLUS_NAME } from '@/constants/app';
import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';

/** Where a store subscription is managed. Apple names this link explicitly. */
const MANAGE_SUBSCRIPTIONS_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';

/**
 * Delete the account (signed in) or erase this device (guest) —
 * docs/ACCOUNT_SPEC.md §3.2 and §3.5, App Store Guideline 5.1.1(v).
 *
 * A plain explanation, the danger button, then a system alert to confirm
 * (owner, 2026-11-17); only the alert's destructive button starts deletion.
 * Still no typed confirmation: Apple rejects deletion flows that are
 * "unnecessarily difficult" (Guideline 5.1.1(v)).
 */
export function DeleteAccountView({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const status = useAuthStore((s) => s.status);
  const hasAppleIdentity = useAuthStore((s) => s.hasAppleIdentity);
  const hasGoogleIdentity = useAuthStore((s) => s.hasGoogleIdentity);
  const pending = useAuthStore((s) => s.pending);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const eraseDeviceData = useAuthStore((s) => s.eraseDeviceData);
  const entitlement = useEntitlementStore((s) => s.entitlement);

  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // From the deletion's outcome: the account had a Sign in with Apple
  // identity and the revoke wasn't confirmed (authStore.deleteAccount).
  const [appleNotRevoked, setAppleNotRevoked] = useState(false);
  // Captured at the start: once deletion lands, status flips to guest and the
  // copy would otherwise switch to the guest version under the user's eyes.
  const [wasSignedIn] = useState(status === 'authenticated');

  if (finished) {
    return (
      <View style={styles.wrap} testID="delete-finished">
        <Text accessibilityRole="header" style={styles.title}>
          {wasSignedIn ? 'Your account has been deleted' : 'Your data has been erased'}
        </Text>
        <Text style={styles.body}>
          {wasSignedIn
            ? // "Deleted", not "gone": the hosting provider's logs and any
              // backups keep some of it for up to 7 days (privacy policy §7).
              'Your predictions and account are deleted from our servers and this phone.'
            : // What Erase removes, as the confirmation says: settings stay,
              // and so does an account's copy (roadmap D60).
              'What you made on this phone without an account is gone.'}
        </Text>
        {/* ACCOUNT_SPEC §3.2 step 5: the sheet was cancelled, the server
            skipped or failed the revoke, or its answer was never seen. Apple's
            own path (support.apple.com/en-us/102571, read 2026-11-19). */}
        {wasSignedIn && appleNotRevoked && (
          <Text style={styles.muted} testID="delete-apple-remove-note">
            Sign in with Apple may still list {APP_NAME}. To remove it, open Settings, tap your
            name, then Sign in with Apple, and remove {APP_NAME}.
          </Text>
        )}
        <Button label="Done" onPress={onDone} testID="delete-done" />
      </View>
    );
  }

  // Auto-renewing only. A lifetime purchase has nothing left to bill.
  const renewing =
    wasSignedIn &&
    entitlement.is_plus &&
    (entitlement.source === 'trial' ||
      entitlement.source === 'monthly' ||
      entitlement.source === 'annual');

  // Run by the confirmation's destructive button. Nothing while the app is
  // locked: the system alert stays above the lock screen, so it can be
  // pressed by someone who never opened the lock (security review,
  // 2026-11-18). Checked before anything else, at the press itself.
  const onConfirm = async () => {
    if (appLocked()) return;
    setError(null);
    if (wasSignedIn) {
      const outcome = await deleteAccount();
      if (outcome.ok) {
        setAppleNotRevoked(outcome.appleNotRevoked === true);
        setFinished(true);
      } else {
        setError(outcome.error);
      }
      return;
    }
    const outcome = await eraseDeviceData();
    if (outcome.ok) setFinished(true);
    else setError(outcome.error);
  };

  const confirmFirst = () => {
    if (wasSignedIn) {
      const store = Platform.OS === 'android' ? 'Google Play' : 'Apple';
      askToConfirm(
        'Delete your account for good?',
        'Your account, predictions and record go from our servers and this phone. ' +
          "This can't be undone." +
          (renewing ? ` ${PLUS_NAME} keeps billing until you cancel it with ${store}.` : ''),
        'Delete account',
        () => void onConfirm(),
      );
    } else {
      askToConfirm(
        'Erase everything on this phone?',
        "There's no other copy. This can't be undone.",
        'Erase',
        () => void onConfirm(),
      );
    }
  };

  return (
    <View style={styles.wrap} testID="delete-confirm">
      <Text accessibilityRole="header" style={styles.title}>
        {wasSignedIn ? 'Delete your account?' : 'Erase your data on this phone?'}
      </Text>
      <Text style={styles.body}>
        {wasSignedIn
          ? // The Warmup's and practice's answers never leave the phone (only
            // tallies go up, as usage counts), so they are named as removed
            // from this phone alone (security review, 2026-11-18).
            'This permanently deletes your account, every prediction and reflection ' +
            'and your calibration history, from our servers and from this phone, and ' +
            'your Warmup and practice answers from this phone. ' +
            "It happens immediately and can't be undone."
          : // Everything wipeLocalUserData and eraseDeviceData remove, named
            // (blind playtest 2026-11-13b, run 6: the old line left out
            // categories, practice and the usage queue), and what stays.
            // Guest rows only, hence "made here without an account": an
            // account's own rows leave the phone when it signs out (D69 (a)),
            // and a wipe that didn't finish is retried at the next launch.
            'This permanently erases what was made on this phone without an account: ' +
            'every prediction and reflection, ' +
            'your categories and their icons, your Warmup and practice answers, a ' +
            'prediction you were still typing, your age range and usage stats not yet ' +
            'sent. Settings, like reminder times, stay. ' +
            "You aren't signed in, so there is no other copy. It can't be undone."}
      </Text>

      {renewing && (
        <View style={styles.warning} testID="delete-subscription-warning">
          <Text style={styles.warningTitle}>Your subscription won't stop</Text>
          <Text style={styles.warningBody}>
            {PLUS_NAME} is billed by{' '}
            {Platform.OS === 'android' ? 'Google Play' : 'Apple'}, and deleting your
            account doesn't cancel it. Cancel it first, or you'll keep being charged.
          </Text>
          <Button
            label="Manage subscription"
            variant="secondary"
            onPress={() => {
              Linking.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() => {});
            }}
            testID="delete-manage-subscription"
          />
        </View>
      )}

      {/* The same test deletion uses to ask Apple (authStore.deleteAccount):
          an email account linked to Apple is asked too (policy audit,
          2026-11-18). */}
      {wasSignedIn && hasAppleIdentity && (
        <Text style={styles.muted} testID="delete-apple-note">
          You'll be asked to confirm with Apple, so {APP_NAME}'s access to your Apple ID
          is removed too.
        </Text>
      )}

      {/* An account made with Google, or linked to it (hasGoogleIdentity,
          step 192). The app holds no Google token, so there is nothing to
          revoke from here and no Google sheet: only where to look. */}
      {wasSignedIn && hasGoogleIdentity && (
        <Text style={styles.muted} testID="delete-google-note">
          Deleting your account removes what Google shared with us. To remove {APP_NAME} from
          your Google Account too, open its security settings and look under third-party
          connections.
        </Text>
      )}

      {error && (
        <Text style={styles.error} accessibilityRole="alert" testID="delete-error">
          {error}
        </Text>
      )}

      <Button
        label={
          pending
            ? wasSignedIn
              ? 'Deleting…'
              : 'Erasing…'
            : wasSignedIn
              ? 'Delete my account'
              : 'Erase everything'
        }
        variant="danger"
        disabled={pending}
        onPress={confirmFirst}
        testID="delete-confirm-button"
      />
      {/* The server call can wait 45 seconds, then the app asks once more
          whether the account is gone (src/supabase/account.ts): said, so a
          long wait doesn't read as stuck (security review, 2026-11-18). An
          erase is on this phone alone and quick. "About", not "up to": the
          worst case is about 65 seconds (round 5). */}
      {pending && wasSignedIn && (
        <Text style={styles.muted} testID="delete-pending-note">
          This can take about a minute.
        </Text>
      )}
      <Button
        label="Cancel"
        variant="secondary"
        disabled={pending}
        onPress={onCancel}
        testID="delete-cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, padding: 24 },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  muted: { ...type.subhead, color: colors.textSecondary },
  warning: {
    backgroundColor: colors.cautionBackground,
    borderRadius: 10,
    gap: 8,
    padding: 14,
  },
  warningTitle: { ...type.subhead, color: colors.cautionText, fontWeight: '700' },
  warningBody: { ...type.subhead, color: colors.cautionText },
  error: { ...type.subhead, color: colors.destructive },
});

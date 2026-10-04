import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
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
 * One deliberate tap after a plain explanation. No typed confirmation: Apple
 * rejects deletion flows that are "unnecessarily difficult", and the
 * explanation is what makes the tap deliberate.
 */
export function DeleteAccountView({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const status = useAuthStore((s) => s.status);
  const provider = useAuthStore((s) => s.provider);
  const pending = useAuthStore((s) => s.pending);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const eraseDeviceData = useAuthStore((s) => s.eraseDeviceData);
  const entitlement = useEntitlementStore((s) => s.entitlement);

  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // Captured at the start: once deletion lands, status flips to guest and the
  // copy would otherwise switch to the guest version under the user's eyes.
  const [wasSignedIn] = useState(status === 'authenticated');

  if (finished) {
    return (
      <View style={styles.wrap} testID="delete-finished">
        <Text style={styles.title}>
          {wasSignedIn ? 'Your account has been deleted' : 'Your data has been erased'}
        </Text>
        <Text style={styles.body}>
          {wasSignedIn
            ? 'Your predictions and account are gone from our servers and this phone.'
            : 'Everything Calibrate stored on this phone is gone.'}
        </Text>
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

  const onConfirm = async () => {
    setError(null);
    const outcome = wasSignedIn ? await deleteAccount() : await eraseDeviceData();
    if (outcome.ok) setFinished(true);
    else setError(outcome.error);
  };

  return (
    <View style={styles.wrap} testID="delete-confirm">
      <Text style={styles.title}>
        {wasSignedIn ? 'Delete your account?' : 'Erase all data on this phone?'}
      </Text>
      <Text style={styles.body}>
        {wasSignedIn
          ? 'This permanently deletes your account, every prediction and reflection, ' +
            'and your calibration history, from our servers and from this phone. ' +
            "It happens immediately and can't be undone."
          : 'This permanently erases every prediction, reflection and your Warmup ' +
            "result from this phone. You aren't signed in, so there is no other copy. " +
            "It can't be undone."}
      </Text>

      {renewing && (
        <View style={styles.warning} testID="delete-subscription-warning">
          <Text style={styles.warningTitle}>Your subscription won't stop</Text>
          <Text style={styles.warningBody}>
            Calibrate Plus is billed by{' '}
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

      {wasSignedIn && provider === 'apple' && (
        <Text style={styles.muted} testID="delete-apple-note">
          You'll be asked to confirm with Apple, so Calibrate's access to your Apple ID
          is removed too.
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
        onPress={() => void onConfirm()}
        testID="delete-confirm-button"
      />
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

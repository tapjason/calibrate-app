import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { PlusPlan } from '@/billing/revenuecat';
import { Button } from '@/components/ui/Button';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';

import {
  FREE_FOREVER_NOTE,
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLUS_FEATURES,
  noticeText,
  priceLine,
  termsLine,
  trialTermsLine,
} from './paywallCopy';

/**
 * The paywall (L6). Reads plans and flow state from paywallStore; the purchase
 * itself happens two layers down in @/billing.
 *
 * It is a destination, never a gate — nothing in the core loop routes here,
 * and every path into it is a user tapping something optional. A build with no
 * billing SDK renders the unavailable state rather than an error.
 */
export function PaywallView({ onClose }: { onClose?: () => void }) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const entitlement = useEntitlementStore((s) => s.entitlement);
  const plans = usePaywallStore((s) => s.plans);
  const loadingPlans = usePaywallStore((s) => s.loadingPlans);
  const purchasing = usePaywallStore((s) => s.purchasing);
  const restoring = usePaywallStore((s) => s.restoring);
  const notice = usePaywallStore((s) => s.notice);
  const loadPlans = usePaywallStore((s) => s.loadPlans);
  const purchase = usePaywallStore((s) => s.purchase);
  const restore = usePaywallStore((s) => s.restore);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const busy = purchasing !== null || restoring;
  const message = noticeText(notice);
  const terms = termsLine(plans);
  const trialTerms = trialTermsLine(plans);

  if (isPlus) {
    return (
      <View style={styles.wrap} testID="paywall-active">
        <Text style={styles.title}>You're on Calibrate Plus</Text>
        <Text style={styles.body}>
          {entitlement.source === 'trial'
            ? 'Your trial is running. Coach and the advanced analytics are unlocked.'
            : 'Coach and the advanced analytics are unlocked.'}
        </Text>
        <Text style={styles.muted}>
          Manage or cancel in your App Store account settings.
        </Text>
        {onClose && <Button label="Done" onPress={onClose} testID="paywall-close" />}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="paywall">
      <Text style={styles.title}>Calibrate Plus</Text>
      <Text style={styles.body}>
        You already know how calibrated you are. Plus tells you what to do about it.
      </Text>

      <View style={styles.features}>
        {PLUS_FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Text style={styles.bullet}>·</Text>
            <Text style={styles.feature}>{feature}</Text>
          </View>
        ))}
      </View>

      {loadingPlans && <ActivityIndicator testID="paywall-loading" />}

      {!loadingPlans && plans.length === 0 && (
        <Text style={styles.muted} testID="paywall-unavailable">
          {noticeText('unavailable')}
        </Text>
      )}

      {plans.map((plan) => (
        <PlanRow
          key={plan.packageId}
          plan={plan}
          disabled={busy}
          busy={purchasing === plan.packageId}
          onPress={() => void purchase(plan.packageId)}
        />
      ))}

      {message && (
        <Text style={styles.notice} testID="paywall-notice">
          {message}
        </Text>
      )}

      <Text style={styles.freeNote} testID="paywall-free-note">
        {FREE_FOREVER_NOTE}
      </Text>

      <Button
        label={restoring ? 'Restoring…' : 'Restore purchases'}
        variant="secondary"
        disabled={busy}
        onPress={() => void restore()}
        testID="paywall-restore"
      />

      {trialTerms !== '' && (
        <Text style={styles.terms} testID="paywall-trial-terms">
          {trialTerms}
        </Text>
      )}

      {terms !== '' && <Text style={styles.terms}>{terms}</Text>}

      {onClose && (
        <Button
          label="Not now"
          variant="secondary"
          onPress={onClose}
          testID="paywall-close"
        />
      )}
    </View>
  );
}

function PlanRow({
  plan,
  disabled,
  busy,
  onPress,
}: {
  plan: PlusPlan;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.planRow} testID={`plan-${plan.plan}`}>
      <View style={styles.planText}>
        <Text style={styles.planLabel}>{PLAN_LABELS[plan.plan]}</Text>
        <Text style={styles.planPrice}>{priceLine(plan)}</Text>
        <Text style={styles.planTagline}>{PLAN_TAGLINES[plan.plan]}</Text>
      </View>
      <Button
        label={busy ? '…' : 'Choose'}
        disabled={disabled}
        onPress={onPress}
        testID={`plan-buy-${plan.plan}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  body: { fontSize: 15, lineHeight: 22, color: '#374151' },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: '#9ca3af', fontSize: 15 },
  feature: { flex: 1, fontSize: 14, lineHeight: 20, color: '#374151' },
  planRow: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 16,
  },
  planText: { flex: 1, gap: 2 },
  planLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
  planPrice: { fontSize: 15, color: '#111827' },
  planTagline: { fontSize: 12, color: '#6b7280' },
  notice: { fontSize: 14, color: '#111827' },
  freeNote: { fontSize: 13, lineHeight: 19, color: '#6b7280' },
  muted: { fontSize: 14, color: '#6b7280' },
  terms: { fontSize: 11, lineHeight: 16, color: '#9ca3af' },
});

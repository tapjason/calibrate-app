import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlusPlan } from '@/billing/revenuecat';
import { Button } from '@/components/ui/Button';
import { chosenProps } from '@/components/ui/chosen';
import { CLOSE_BUTTON_SIZE, CloseButton } from '@/components/ui/CloseButton';
import { Icon } from '@/components/ui/Icon';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { useSettingsStore } from '@/store/settingsStore';

import {
  FREE_FOREVER_NOTE,
  PLAN_LABELS,
  PLAN_TAGLINES,
  PLUS_FEATURES,
  ctaLabel,
  defaultPlan,
  noticeText,
  monthlyEquivalentLine,
  priceLine,
  sortPlans,
  termsLine,
  trialTermsLine,
  trialTimeline,
} from './paywallCopy';

/** A symbol per benefit row, in PLUS_FEATURES order (DESIGN_SYSTEM §7.6). */
const BENEFIT_ICONS = [
  { sf: 'sparkles', ion: 'sparkles' },
  { sf: 'chart.line.uptrend.xyaxis', ion: 'trending-up' },
  { sf: 'paintpalette.fill', ion: 'color-palette' },
] as const;

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

  // Annual preselected (DESIGN_SYSTEM §7.6). Held as an id so a plan list
  // that reloads doesn't reset a choice the user already made.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = sortPlans(plans);
  const selected =
    ordered.find((p) => p.packageId === selectedId) ?? defaultPlan(ordered);
  // The reminder step only while the app would send it (roadmap D16).
  const remindersOn = useSettingsStore((s) => s.notificationsEnabled);
  const timeline = selected ? trialTimeline(selected, { reminder: remindersOn }) : null;

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
      {/* The way out people look for, at the top (roadmap step 30). "Not now"
          below the plans stays, but on a phone it's below the fold. */}
      {onClose && (
        <CloseButton onPress={onClose} style={styles.dismiss} testID="paywall-dismiss" />
      )}
      <Text style={[styles.title, onClose && styles.titleBesideClose]}>Calibrate Plus</Text>
      <Text style={styles.body}>
        You already know how calibrated you are. Plus tells you what to do about it.
      </Text>

      <View style={styles.features}>
        {PLUS_FEATURES.map((feature, i) => {
          const icon = BENEFIT_ICONS[i] ?? BENEFIT_ICONS[0];
          return (
            <View key={feature} style={styles.featureRow}>
              <Icon sf={icon.sf} fallback={icon.ion} size={20} color={colors.brand600} />
              <Text style={styles.feature}>{feature}</Text>
            </View>
          );
        })}
      </View>

      {loadingPlans && <ActivityIndicator testID="paywall-loading" />}

      {!loadingPlans && plans.length === 0 && (
        <Text style={styles.muted} testID="paywall-unavailable">
          {noticeText('unavailable')}
        </Text>
      )}

      {ordered.length > 0 && (
        <View style={styles.plans} accessibilityRole="radiogroup">
          {ordered.map((plan) => (
            <PlanOption
              key={plan.packageId}
              plan={plan}
              selected={selected?.packageId === plan.packageId}
              disabled={busy}
              onPress={() => setSelectedId(plan.packageId)}
            />
          ))}
        </View>
      )}

      {timeline && (
        <View style={styles.timeline} testID="paywall-timeline">
          {timeline.map((step) => (
            <View key={step.when} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineText}>
                <Text style={styles.timelineWhen}>{step.when}</Text>
                <Text style={styles.timelineWhat}>{step.what}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {selected && (
        <Button
          label={purchasing ? 'Opening the App Store…' : ctaLabel(selected)}
          disabled={busy}
          onPress={() => void purchase(selected.packageId)}
          testID="paywall-cta"
        />
      )}

      {message && (
        <Text style={styles.notice} testID="paywall-notice">
          {message}
        </Text>
      )}

      <Text style={styles.freeNote} testID="paywall-free-note">
        {FREE_FOREVER_NOTE}
      </Text>

      {/* A text button (DESIGN_SYSTEM §7.6): as an outlined capsule it read
          as a second call to action between the one CTA and "Not now". */}
      <Pressable
        onPress={() => void restore()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        hitSlop={8}
        style={styles.restore}
        testID="paywall-restore"
      >
        <Text style={[styles.restoreText, busy && styles.restoreBusy]}>
          {restoring ? 'Restoring…' : 'Restore purchases'}
        </Text>
      </Pressable>

      {trialTerms !== '' && (
        <Text style={styles.terms} testID="paywall-trial-terms">
          {trialTerms}
        </Text>
      )}

      {terms !== '' && <Text style={styles.terms}>{terms}</Text>}

      <LegalLinks />

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

/**
 * Terms of use and privacy policy. Guideline 3.1.2 requires both to be
 * reachable from the purchase screen itself, and a missing link is one of the
 * most common subscription rejections. Shown whether or not plans loaded: the
 * terms are the same either way.
 */
function LegalLinks() {
  const open = (url: string) => {
    openBrowserAsync(url).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[paywall] could not open link:', e);
    });
  };
  return (
    <View style={styles.legal}>
      <Pressable
        accessibilityRole="link"
        onPress={() => open(TERMS_OF_USE_URL)}
        testID="paywall-terms-link"
      >
        <Text style={styles.legalLink}>Terms of Use</Text>
      </Pressable>
      {PRIVACY_POLICY_URL && (
        <Pressable
          accessibilityRole="link"
          onPress={() => open(PRIVACY_POLICY_URL as string)}
          testID="paywall-privacy-link"
        >
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * One radio card. Selecting it only changes what the single button below
 * buys — nothing is charged from here.
 */
function PlanOption({
  plan,
  selected,
  disabled,
  onPress,
}: {
  plan: PlusPlan;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const equivalent = monthlyEquivalentLine(plan);
  return (
    <Pressable
      testID={`plan-${plan.plan}`}
      accessibilityRole="radio"
      {...chosenProps('radio', selected, disabled)}
      accessibilityLabel={[
        `${PLAN_LABELS[plan.plan]}, ${priceLine(plan)}.`,
        equivalent,
        PLAN_TAGLINES[plan.plan],
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.plan,
        plan.plan === 'lifetime' && styles.planSmall,
        selected && styles.planSelected,
      ]}
    >
      {/* The radio mark carries selection without colour: filled vs hollow. */}
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.planText}>
        <View style={styles.planHeader}>
          <Text style={styles.planLabel}>{PLAN_LABELS[plan.plan]}</Text>
          <Text style={styles.planTagline}>{PLAN_TAGLINES[plan.plan]}</Text>
        </View>
        <Text style={styles.planPrice}>{priceLine(plan)}</Text>
        {/* Smaller than the billed price, never instead of it (App Review
            3.1.2: the billed amount stays the most prominent price). */}
        {equivalent && (
          <Text style={styles.planEquivalent} testID={`plan-${plan.plan}-equivalent`}>
            {equivalent}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, padding: space.xxl },
  dismiss: { position: 'absolute', right: space.lg, top: space.lg, zIndex: 1 },
  title: { ...type.titleXL, color: colors.textPrimary },
  // Clear of the close control floating at the top right, so a narrow screen
  // wraps the title instead of running it under the × (step 70). Only when
  // the × is there.
  titleBesideClose: { marginRight: CLOSE_BUTTON_SIZE + space.sm },
  body: { ...type.callout, color: colors.textSecondary },
  features: { gap: space.md },
  featureRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md },
  feature: { ...type.subhead, color: colors.textPrimary, flex: 1 },
  plans: { gap: space.sm },
  plan: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  planSmall: { paddingVertical: space.md },
  planSelected: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  radio: {
    alignItems: 'center',
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOn: { borderColor: colors.brand600 },
  radioDot: {
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  planText: { flex: 1, gap: 2 },
  planHeader: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  planLabel: { ...type.headline, color: colors.textPrimary },
  planTagline: { ...type.footnote, color: colors.textSecondary },
  planPrice: { ...type.subhead, color: colors.textPrimary },
  planEquivalent: { ...type.footnote, color: colors.textSecondary },
  timeline: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.md,
    padding: space.lg,
  },
  timelineRow: { flexDirection: 'row', gap: space.md },
  timelineDot: {
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  timelineText: { flex: 1, gap: 2 },
  timelineWhen: { ...type.headline, color: colors.textPrimary },
  timelineWhat: { ...type.subhead, color: colors.textSecondary },
  notice: { ...type.subhead, color: colors.textPrimary },
  freeNote: { ...type.footnote, color: colors.textSecondary },
  restore: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  restoreText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  restoreBusy: { color: colors.textTertiary },
  muted: { ...type.subhead, color: colors.textSecondary },
  terms: { ...type.caption, fontWeight: '400', color: colors.textSecondary },
  legal: { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  legalLink: {
    ...type.footnote,
    color: colors.textSecondary,
    paddingVertical: 8,
    textDecorationLine: 'underline',
  },
});

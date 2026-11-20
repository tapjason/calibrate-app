import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { PlusPlan } from '@/billing/revenuecat';
import { Button } from '@/components/ui/Button';
import { chosenProps } from '@/components/ui/chosen';
import { CLOSE_BUTTON_SIZE, CloseButton } from '@/components/ui/CloseButton';
import { Icon } from '@/components/ui/Icon';
import { PLUS_NAME, PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { useSettingsStore } from '@/store/settingsStore';

import {
  FREE_FOREVER_NOTE,
  PLAN_LABELS,
  PLUS_FEATURES,
  ctaLabel,
  defaultPlan,
  noPlansText,
  noTrialLine,
  noticeText,
  monthlyEquivalentLine,
  planAccessibilityLabel,
  planBadge,
  priceLine,
  sortPlans,
  termsLine,
  trialTermsLine,
  trialTimeline,
} from './paywallCopy';

/** A symbol per benefit row, in PLUS_FEATURES order (DESIGN_SYSTEM §7.6). */
const BENEFIT_ICONS = [
  // Coach: a speech bubble, what it is, not the stock "AI" sparkle (roadmap D33).
  { sf: 'text.bubble', ion: 'chatbubble-ellipses-outline' },
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
 *
 * `billingReady` false (the route waiting for `ensureBillingStarted`, roadmap
 * D70): the plans aren't asked for yet, the screen shows its loading state,
 * and nothing that reaches the store (a plan, the purchase, Restore) can be
 * pressed. True by default.
 */
export function PaywallView({
  onClose,
  billingReady = true,
}: {
  onClose?: () => void;
  billingReady?: boolean;
}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const entitlement = useEntitlementStore((s) => s.entitlement);
  const plans = usePaywallStore((s) => s.plans);
  const loadingPlans = usePaywallStore((s) => s.loadingPlans);
  const billingAvailable = usePaywallStore((s) => s.available);
  const purchasing = usePaywallStore((s) => s.purchasing);
  const restoring = usePaywallStore((s) => s.restoring);
  const notice = usePaywallStore((s) => s.notice);
  const loadPlans = usePaywallStore((s) => s.loadPlans);
  const purchase = usePaywallStore((s) => s.purchase);
  const restore = usePaywallStore((s) => s.restore);
  const clearNotice = usePaywallStore((s) => s.clearNotice);
  // Waiting for RevenueCat to start reads as loading the plans.
  const loading = loadingPlans || !billingReady;

  // A notice is the outcome of something done on this visit. One still in the
  // store when the paywall opens is from an earlier visit ("Your purchase
  // went through…" long after), so it goes before the first paint. Only on
  // opening: one that arrives during the visit, billing starting and the
  // plans loading included, stays (review round 2, item 2).
  useLayoutEffect(() => {
    clearNotice();
  }, [clearNotice]);

  // Said aloud when it appears, as SignInView says its errors: a line that
  // appears posts nothing to VoiceOver. Once per change, and not for the
  // stale one the screen opened with (review round 2, item 1).
  const spokenNotice = useRef(notice);
  useEffect(() => {
    if (notice === spokenNotice.current) return;
    spokenNotice.current = notice;
    const words = noticeText(notice);
    if (words) AccessibilityInfo.announceForAccessibility(words);
  }, [notice]);

  // Before the first paint: loadPlans marks the plans as loading at once, so
  // a first open shows the spinner rather than a frame of "couldn't load".
  // Not before billing has started: the plans would be asked of a store that
  // isn't configured yet.
  useLayoutEffect(() => {
    if (billingReady) void loadPlans();
  }, [billingReady, loadPlans]);

  // Annual preselected (DESIGN_SYSTEM §7.6). Held as an id so a plan list
  // that reloads doesn't reset a choice the user already made.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = sortPlans(plans);
  const selected =
    ordered.find((p) => p.packageId === selectedId) ?? defaultPlan(ordered);
  // The reminder step only while the app would send it (roadmap D16): the
  // Notifications switch on AND iOS permission granted, without which
  // nothing is scheduled (src/notifications/trialReminder.ts). Not yet read
  // (null), denied or not asked: no step, since a promise not made is the
  // safe side (security review, 2026-11-18, round 4).
  const reminderComes = useSettingsStore(
    (s) => s.notificationsEnabled && s.notificationPermission === 'granted',
  );
  const timeline = selected ? trialTimeline(selected, { reminder: reminderComes }) : null;

  const busy = purchasing !== null || restoring || !billingReady;
  const message = noticeText(notice);
  // The fine print for the plan chosen, not every plan on offer: Lifetime
  // read "Your free trial turns into a paid subscription" (blind playtest
  // 2026-11-04, second round, run 4).
  const terms = termsLine(selected ? [selected] : plans);
  const trialTerms = trialTermsLine(selected ? [selected] : plans);

  if (isPlus) {
    return (
      <View style={styles.wrap} testID="paywall-active">
        <Text accessibilityRole="header" style={styles.title}>You're on {PLUS_NAME}</Text>
        <Text style={styles.body}>
          {entitlement.source === 'trial'
            ? 'Your trial is running. Coach and Trends are unlocked.'
            : 'Coach and Trends are unlocked.'}
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
      <Text accessibilityRole="header" style={[styles.title, onClose && styles.titleBesideClose]}>{PLUS_NAME}</Text>
      {/* True on Day 0 too. It said "You already know how calibrated you
          are", which two blind testers with nothing resolved called false. */}
      <Text style={styles.body}>
        Your score, curve and cards are free. Plus reads them for you and goes deeper.
      </Text>

      <View style={styles.features}>
        {PLUS_FEATURES.map((feature, i) => {
          const icon = BENEFIT_ICONS[i] ?? BENEFIT_ICONS[0];
          return (
            <View key={feature} style={styles.featureRow}>
              <Icon sf={icon.sf} fallback={icon.ion} size={20} color={colors.action} />
              <Text style={styles.feature}>{feature}</Text>
            </View>
          );
        })}
      </View>

      {loading && <ActivityIndicator testID="paywall-loading" />}

      {!loading && plans.length === 0 && (
        <Text style={styles.muted} testID="paywall-unavailable">
          {noPlansText(billingAvailable)}
        </Text>
      )}

      {ordered.length > 0 && (
        <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel="Plan">
          {ordered.map((plan) => (
            <PlanOption
              key={plan.packageId}
              plan={plan}
              offer={ordered}
              selected={selected?.packageId === plan.packageId}
              disabled={busy}
              onPress={() => setSelectedId(plan.packageId)}
            />
          ))}
        </View>
      )}

      {timeline && (
        <View style={styles.timeline} testID="paywall-timeline">
          <Text
            accessibilityRole="header"
            style={styles.timelineHeading}
            testID="paywall-timeline-heading"
          >
            How the free trial works
          </Text>
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
  offer,
  selected,
  disabled,
  onPress,
}: {
  plan: PlusPlan;
  /** Every plan on offer: "No free trial" shows only when one of them has a trial. */
  offer: readonly PlusPlan[];
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const equivalent = monthlyEquivalentLine(plan);
  const badge = planBadge(plan);
  const noTrial = noTrialLine(plan, offer);
  return (
    <Pressable
      testID={`plan-${plan.plan}`}
      accessibilityRole="radio"
      {...chosenProps('radio', selected, disabled)}
      accessibilityLabel={planAccessibilityLabel(plan, offer)}
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
          {/* The free trial as a label beside the name (DESIGN_SYSTEM §7.6),
              not a clause in the price line (owner, TestFlight 2026-11-17). */}
          {badge.trial ? (
            <View style={styles.trialBadge} testID={`plan-${plan.plan}-trial-badge`}>
              <Text style={styles.trialBadgeText}>{badge.text}</Text>
            </View>
          ) : (
            <Text style={styles.planTagline}>{badge.text}</Text>
          )}
        </View>
        <Text style={styles.planPrice}>{priceLine(plan)}</Text>
        {/* Smaller than the billed price, never instead of it (App Review
            3.1.2: the billed amount stays the most prominent price). */}
        {equivalent && (
          <Text style={styles.planEquivalent} testID={`plan-${plan.plan}-equivalent`}>
            {equivalent}
          </Text>
        )}
        {noTrial && (
          <Text style={styles.planEquivalent} testID={`plan-${plan.plan}-no-trial`}>
            {noTrial}
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
  planSelected: { backgroundColor: colors.selectedFill, borderColor: colors.action },
  radio: {
    alignItems: 'center',
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOn: { borderColor: colors.action },
  radioDot: {
    backgroundColor: colors.action,
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  planText: { flex: 1, gap: 2 },
  // Wraps so the badge drops under the name at a narrow width or a large
  // Dynamic Type size, rather than running off the card.
  planHeader: {
    alignItems: 'baseline',
    columnGap: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.xs,
  },
  planLabel: { ...type.headline, color: colors.textPrimary },
  planTagline: { ...type.footnote, color: colors.textSecondary },
  trialBadge: {
    backgroundColor: colors.action,
    borderRadius: radius.pill,
    flexShrink: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  trialBadgeText: { ...type.footnote, color: colors.onAction, fontWeight: '600' },
  planPrice: { ...type.subhead, color: colors.textPrimary },
  planEquivalent: { ...type.footnote, color: colors.textSecondary },
  timeline: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.md,
    padding: space.lg,
  },
  timelineHeading: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  timelineRow: { flexDirection: 'row', gap: space.md },
  timelineDot: {
    backgroundColor: colors.action,
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
  restoreText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
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

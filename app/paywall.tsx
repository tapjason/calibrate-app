import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';
import { PAYWALL_SOURCES, type PaywallSource } from '@/analytics/events';
import { ensureBillingStarted } from '@/billing/init';
import { LocalOnlyPage } from '@/components/age/LocalOnlyPage';
import {
  LOCAL_ONLY_PAYWALL_BODY,
  LOCAL_ONLY_PAYWALL_MANAGE,
  LOCAL_ONLY_PAYWALL_TITLE,
} from '@/components/age/localOnlyCopy';
import { PaywallView } from '@/components/paywall/PaywallView';
import { useAgeStore } from '@/store/ageStore';

export default function PaywallScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  // The under-13 rule (roadmap D70): Plus isn't offered, so the plans are
  // never drawn, RevenueCat is never started from here and nothing is
  // recorded. Read from the store, so a band that arrives while this is open
  // takes the paywall away at once. Reachable by deep link, so checked here
  // whatever opened it.
  const localOnly = useAgeStore((s) => s.localOnly);
  // RevenueCat started (or known unavailable) before the plans are asked for:
  // on a launch still waiting for Apple's answer it waits at most 5 s
  // (`ensureBillingStarted`). Until then the paywall shows its loading state.
  const [billingReady, setBillingReady] = useState(false);

  useEffect(() => {
    if (localOnly) return;
    let live = true;
    // Never rejects; false (no SDK or key, a configure that failed) still
    // opens the paywall, which then says why there are no plans.
    void ensureBillingStarted().then(() => {
      if (live) setBillingReady(true);
    });
    return () => {
      live = false;
    };
  }, [localOnly]);

  // Which upsell actually converts is the whole reason the two entry points
  // are distinguishable. An unrecognized value reads as a deep link rather
  // than being passed through — the event catalogue takes no free-form
  // strings. Not under the rule: no paywall was shown.
  useEffect(() => {
    if (localOnly) return;
    const source: PaywallSource = (PAYWALL_SOURCES as readonly string[]).includes(
      from ?? '',
    )
      ? (from as PaywallSource)
      : 'deep_link';
    void track('paywall_viewed', { source });
  }, [from, localOnly]);
  // Dismiss to wherever the user came from. `canGoBack` matters because the
  // paywall is also reachable from a deep link, where there is no back stack.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/insights' as never);

  // A full-screen modal has no header, so it insets its own top edge: without
  // this the title and the close control sit under the status bar and notch.
  // By the window's inset, read from the root: `SafeAreaView` measured none
  // inside this modal on the first TestFlight build (iPhone 17, iOS 26,
  // 2026-11-16), and the title sat under the clock.
  const insets = useSafeAreaInsets();
  if (localOnly) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <LocalOnlyPage
          title={LOCAL_ONLY_PAYWALL_TITLE}
          body={LOCAL_ONLY_PAYWALL_BODY}
          note={LOCAL_ONLY_PAYWALL_MANAGE}
          onClose={close}
          testID="paywall-local-only"
        />
      </View>
    );
  }
  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView>
        <PaywallView onClose={close} billingReady={billingReady} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});

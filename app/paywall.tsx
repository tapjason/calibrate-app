import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';
import { PAYWALL_SOURCES, type PaywallSource } from '@/analytics/events';
import { PaywallView } from '@/components/paywall/PaywallView';

export default function PaywallScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  // Which upsell actually converts is the whole reason the two entry points
  // are distinguishable. An unrecognized value reads as a deep link rather
  // than being passed through — the event catalogue takes no free-form
  // strings.
  useEffect(() => {
    const source: PaywallSource = (PAYWALL_SOURCES as readonly string[]).includes(
      from ?? '',
    )
      ? (from as PaywallSource)
      : 'deep_link';
    void track('paywall_viewed', { source });
  }, [from]);
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
  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView>
        <PaywallView onClose={close} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});

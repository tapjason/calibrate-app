import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

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
    router.canGoBack() ? router.back() : router.replace('/(tabs)/stats' as never);

  return (
    <ScrollView>
      <PaywallView onClose={close} />
    </ScrollView>
  );
}

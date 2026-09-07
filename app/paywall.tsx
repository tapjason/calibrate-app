import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { PaywallView } from '@/components/paywall/PaywallView';

export default function PaywallScreen() {
  const router = useRouter();
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

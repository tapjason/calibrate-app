import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { SettingsView } from '@/components/settings/SettingsView';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <ScrollView>
      <SettingsView
        onOpenPaywall={() => router.push('/paywall?from=settings' as never)}
      />
    </ScrollView>
  );
}

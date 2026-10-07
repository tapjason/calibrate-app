import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { SettingsView } from '@/components/settings/SettingsView';

/**
 * You (roadmap D3): what was the Settings tab, with your card one row away.
 * The paywall's `from=settings` keeps its old name so the analytics series
 * stays continuous.
 */
export default function YouScreen() {
  const router = useRouter();
  return (
    <ScrollView>
      <SettingsView
        onOpenCard={() => router.push('/share' as never)}
        onOpenPaywall={() => router.push('/paywall?from=settings' as never)}
        onOpenAccount={() => router.push('/account' as never)}
        onOpenDelete={() => router.push('/account/delete' as never)}
        onOpenScoring={() => router.push('/scoring' as never)}
      />
    </ScrollView>
  );
}

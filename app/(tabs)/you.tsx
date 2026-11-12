import { useScrollToTop } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SettingsView } from '@/components/settings/SettingsView';
import { Button } from '@/components/ui/Button';
import { space } from '@/constants/theme';

/**
 * You (roadmap D3): what was the Settings tab, with your card one row away.
 * The paywall's `from=settings` keeps its old name so the analytics series
 * stays continuous.
 */
export default function YouScreen() {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  // A second tap on the tab scrolls back to the top, as iOS tabs do
  // (playtest 2026-11-08b, finding 13).
  useScrollToTop(scroll);
  return (
    <ScrollView ref={scroll}>
      <SettingsView
        onOpenCard={() => router.push('/share' as never)}
        onOpenPaywall={() => router.push('/paywall?from=settings' as never)}
        onOpenAccount={() => router.push('/account' as never)}
        onOpenDelete={() => router.push('/account/delete' as never)}
        onOpenScoring={() => router.push('/scoring' as never)}
        onOpenCategories={() => router.push('/categories' as never)}
      />
      {/* Development builds only: the way to /dev/seed's demo data and
          playtest profiles on the iPhone, which has no address bar. */}
      {__DEV__ && (
        <View style={styles.dev}>
          <Button
            label="Test data and playtest profiles (development only)"
            variant="secondary"
            onPress={() => router.push('/dev/seed' as never)}
            testID="you-dev-seed"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dev: { paddingBottom: space.xl, paddingHorizontal: space.lg },
});

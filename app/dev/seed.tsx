import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';

/**
 * Development only: loads the demo predictions for store screenshots
 * (APP_STORE_LISTING.md §5, NEXT_STEPS d). Open /dev/seed on the web build or
 * a dev client. In a release build this route just redirects home.
 */
export default function DevSeedScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  const load = async () => {
    setBusy(true);
    try {
      const added = await usePredictionStore.getState().loadDemoData();
      setStatus(added ? 'Demo data loaded.' : 'Demo data was already loaded.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Demo data</Text>
        <Text style={styles.body}>
          Adds about 145 resolved and 7 open predictions to this device, for
          screenshots. Development builds only.
        </Text>
        <Button
          label={busy ? 'Loading…' : 'Load demo data'}
          onPress={() => void load()}
          disabled={busy}
          testID="dev-seed-load"
        />
        {status && (
          <Text style={styles.body} testID="dev-seed-status">
            {status}
          </Text>
        )}
        <Button
          label="Go to Home"
          variant="secondary"
          onPress={() => router.replace('/' as never)}
          testID="dev-seed-home"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  wrap: { gap: space.md, padding: space.lg },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
});

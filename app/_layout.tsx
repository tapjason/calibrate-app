import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { initDb } from '@/db/client';
import { initDigest } from '@/notifications/digest';
import { initNotifications } from '@/notifications/scheduler';
import { usePredictionStore } from '@/store/predictionStore';
import { useAuthStore } from '@/store/authStore';
import { useStatsStore } from '@/store/statsStore';

// Root layout = the auth + DB gate. Until both finish initializing, no screen
// renders. Without this, any screen that calls getDb() or requireUserId()
// would throw on first mount.
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await useAuthStore.getState().initialize();
        const userId = useAuthStore.getState().userId;
        if (userId) {
          // Warm the local lists + stats so the first paint of any screen has data.
          await Promise.all([
            usePredictionStore.getState().loadPending(),
            usePredictionStore.getState().loadResolved(),
            useStatsStore.getState().loadForUser(userId),
          ]);
        }
        // Fire-and-forget: notifications are a retention enhancer, not a
        // critical-path dependency. A failure here (denied permission,
        // missing module, web) must not block the ready gate.
        initNotifications().catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[notifications] init failed:', e);
        });
        initDigest().catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[digest] init failed:', e);
        });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't start the app</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorBody: { color: '#888', paddingHorizontal: 24, textAlign: 'center' },
});

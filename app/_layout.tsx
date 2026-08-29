import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { initDb } from '@/db/client';
import { initDigest } from '@/notifications/digest';
import {
  initNotifications,
  routeFromLaunchNotification,
} from '@/notifications/scheduler';
import { usePredictionStore } from '@/store/predictionStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { selectHasCompletedWarmup, useWarmupStore } from '@/store/warmupStore';
import { syncNow } from '@/supabase/sync';

// Root layout = the auth + DB gate. Until both finish initializing, no screen
// renders. Without this, any screen that calls getDb() or requireUserId()
// would throw on first mount.
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Becomes defined once the root navigator has mounted; until then any
  // router.push throws ("navigate before mounting the Root Layout").
  const navState = useRootNavigationState();
  const router = useRouter();
  const launchRouted = useRef(false);

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
        // Load persisted toggles before notifications init so the scheduler
        // and digest seed the correct enabled state. hydrate() swallows its
        // own errors and always resolves, so it can't block the gate.
        await useSettingsStore.getState().hydrate();
        // Onboarding state, needed before the first-run redirect below can
        // decide anything. Like settings, hydrate() swallows its own errors.
        await useWarmupStore.getState().hydrate();
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

  // Cold-start deep link. We can only navigate once the root navigator is
  // mounted (navState defined) and the app gate is open (ready). Gating here —
  // rather than inside the fire-and-forget initNotifications() — is what keeps
  // the launch push from racing the navigator mount. Runs at most once.
  useEffect(() => {
    if (!ready || !navState?.key || launchRouted.current) return;
    launchRouted.current = true;
    (async () => {
      await routeFromLaunchNotification().catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[notifications] launch deep link failed:', e);
      });
      // First run: nobody has taken the Warmup, so onboarding owns the first
      // screen. Sequenced after the deep link rather than racing it — though
      // the two can't realistically collide, since a pending resolution
      // notification only exists for someone who is already past onboarding.
      if (!selectHasCompletedWarmup(useWarmupStore.getState())) {
        router.replace('/warmup' as never);
      }
    })();
  }, [ready, navState?.key, router]);

  // Foreground sync. Sign-in already triggers one sweep via authStore; this
  // catches every subsequent return to the app so other devices' writes
  // land without a manual refresh. syncNow is no-op for guests, idempotent
  // for concurrent calls, and swallows its own errors.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const userId = useAuthStore.getState().userId;
      if (!userId) return;
      void syncNow(userId);
    });
    return () => sub.remove();
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

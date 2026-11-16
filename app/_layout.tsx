import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Stack, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { ensureAgeBucket } from '@/age/ageRange';
import { flushEvents } from '@/analytics/flush';
import { initBilling, refreshBilling } from '@/billing/init';
import { AppLockGate } from '@/components/launch/AppLockGate';
import { LaunchPage } from '@/components/launch/LaunchPage';
import { LaunchScreen } from '@/components/launch/LaunchScreen';
import { holdSplash, useLaunchSplash } from '@/components/launch/useLaunchSplash';
import { useAppearance } from '@/components/ui/useAppearance';
import { loadFonts } from '@/constants/fonts';
import { colors, palettes, type } from '@/constants/theme';
import { initDb } from '@/db/client';
import { initDigest } from '@/notifications/digest';
import { initPracticeReminder } from '@/notifications/practiceReminder';
import { initTrialReminder } from '@/notifications/trialReminder';
import {
  initNotifications,
  routeFromLaunchNotification,
} from '@/notifications/scheduler';
import { useLockStore } from '@/store/lockStore';
import { useLogDraftStore } from '@/store/logDraftStore';
import { useResolveRunStore } from '@/store/resolveRunStore';
import { usePracticeStore } from '@/store/practiceStore';
import { usePredictionStore } from '@/store/predictionStore';
import { syncForUser, useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { selectHasCompletedWarmup, useWarmupStore } from '@/store/warmupStore';

// The native splash stays up until the first real screen is decided
// (roadmap step 59), rather than cutting to the loading view below.
holdSplash();

// Root layout = the auth + DB gate. Until both finish initializing, no screen
// renders. Without this, any screen that calls getDb() or requireUserId()
// would throw on first mount.
/**
 * React Navigation's chrome (headers, the tab bar, card backgrounds) in the
 * app's own neutrals, light or dark with the phone (roadmap D7). Plain hex,
 * not the dynamic tokens: the navigation library reads these as strings.
 */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const p = palettes[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: p.action,
      background: p.canvas,
      card: p.surface,
      text: p.textPrimary,
      border: p.hairline,
      notification: p.destructive,
    },
  };
}

export default function RootLayout() {
  // Not useColorScheme: on web it missed the first switch (step 91).
  const scheme = useAppearance();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True once the gate is open and any first-run redirect is made, so the
  // first frame after the splash is the screen the person will use.
  const [launched, setLaunched] = useState(false);
  useLaunchSplash(launched || error !== null);
  // Becomes defined once the root navigator has mounted; until then any
  // router.push throws ("navigate before mounting the Root Layout").
  const navState = useRootNavigationState();
  const router = useRouter();
  // Where the app opened, for the first-run redirect below: read once, there.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const launchRouted = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        // Instrument Sans on web (D33), alongside the database, so the first
        // screen paints in it; native builds embed the font. Never rejects.
        await Promise.all([initDb(), loadFonts()]);
        await useAuthStore.getState().initialize();
        const userId = useAuthStore.getState().userId;
        if (userId) {
          // Warm the local lists + stats so the first paint of any screen has data.
          await Promise.all([
            // The person's own category names (roadmap D39).
            useCategoryStore.getState().load(),
            usePredictionStore.getState().loadPending(),
            usePredictionStore.getState().loadResolved(),
            useStatsStore.getState().loadForUser(userId),
          ]);
        }
        // Load persisted toggles before notifications init so the scheduler
        // and digest seed the correct enabled state. hydrate() swallows its
        // own errors and always resolves, so it can't block the gate.
        await useSettingsStore.getState().hydrate();
        // The app lock (D64), if the person chose one: armed here, before the
        // gate opens, so no screen is drawn ahead of it. Synchronous, and a
        // build without the module never locks.
        useLockStore.getState().arm();
        // Entitlement mirror + RevenueCat. Awaited only as far as the local
        // SQLite read inside initBilling — the network half of it swallows its
        // own errors, and a user who can't be reached by RevenueCat is a free
        // user with a fully working app.
        await initBilling().catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[billing] init failed:', e);
        });
        // Onboarding state, needed before the first-run redirect below can
        // decide anything. Like settings, hydrate() swallows its own errors.
        // Practice answers load beside it, so Today's row is right on the
        // first paint.
        await Promise.all([
          useWarmupStore.getState().hydrate(),
          usePracticeStore.getState().hydrate(),
          // Log's kept draft (step 173).
          useLogDraftStore.getState().hydrate(),
          // An answer run left mid-way by a reload (step 179).
          useResolveRunStore.getState().hydrate(),
        ]);
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
        // The reminder before a trial renews follows the same toggle (D16).
        initTrialReminder();
        // So does the daily practice reminder, once a time is chosen (step 89).
        initPracticeReminder();
        // One sweep at startup so a queue built up offline doesn't wait for
        // the next foreground. Fire-and-forget; it returns 0 and logs on any
        // failure. A guest sends only funnel counts, with no id (D43).
        void flushEvents(useAuthStore.getState().userId);
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
      //
      // "No Warmup record" is NOT sufficient on its own. An install upgrading
      // past migration 005 has no warmup_results row, and warmupStore.hydrate()
      // deliberately swallows read errors and reports "not taken" — either
      // would drop a user with months of history into an unskippable quiz with
      // no route back to their own data. Existing predictions are proof this
      // is not a first run, whatever the Warmup table says.
      const { pending, resolved } = usePredictionStore.getState();
      const isFirstRun = pending.length === 0 && resolved.length === 0;
      // A development build opened on /dev (the playtest profiles) stays
      // there: a profile is how an empty device gets its start state.
      const onDevRoute = __DEV__ && pathnameRef.current.startsWith('/dev');
      if (isFirstRun && !onDevRoute && !selectHasCompletedWarmup(useWarmupStore.getState())) {
        router.replace('/warmup' as never);
      }
      setLaunched(true);
    })();
  }, [ready, navState?.key, router]);

  // Age assurance, once the first screen is up. Not part of the ready gate:
  // Apple's sheet needs a view controller, and a missing API, a decline, or
  // a throw must not hold the splash. One attempt per launch; a stored band
  // means it is not asked again. The promise never rejects. It waits for the
  // app lock (D64): Apple's sheet shouldn't open under the lock screen. This
  // runs again on each unlock, and `ensureAgeBucket` still asks once per launch.
  const locked = useLockStore((s) => s.locked);
  useEffect(() => {
    if (!launched || locked) return;
    void ensureAgeBucket().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[age] check failed:', e);
    });
  }, [launched, locked]);

  // Foreground sync. Sign-in already triggers one sweep via authStore; this
  // catches every subsequent return to the app so other devices' writes
  // land without a manual refresh. The sync is a no-op for guests, idempotent
  // for concurrent calls, and swallows its own errors.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const userId = useAuthStore.getState().userId;
      if (!userId) return;
      void syncForUser(userId);
      // Renewals, lapses, refunds, and purchases made on another device all
      // happen outside this process. Foreground is the only moment we get to
      // notice them.
      void refreshBilling();
      // Analytics rides along on the same trigger. Queued locally as it
      // happens, pushed when the app is already doing network work anyway.
      void flushEvents(userId);
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
  // Behind the native splash on a phone; what web shows while the database
  // opens. The launch page as the splash draws it (step 187), so what follows
  // it moves nothing.
  if (!ready) return <LaunchPage markOnly />;

  // Scoped tasks open as sheets with a grabber (DESIGN_SYSTEM §7.7): Resolve
  // at a tall detent so the prompt and the Today list behind it both stay in
  // mind, Share at full height; the paywall is a full-screen modal. Fixed
  // detents, because fitToContents still has open sizing bugs. On web these
  // fall back to ordinary modal presentation.
  return (
    <ThemeProvider value={navigationTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen
          name="resolve/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        {/* A run of several (roadmap step 18) is the same task, so the same sheet. */}
        {/* An open prediction's details (roadmap D25). */}
        <Stack.Screen
          name="prediction/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="resolve/run"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="share/index"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        {/* Reading, not a task: a full-height sheet, dismissed by the grabber or Done. */}
        <Stack.Screen
          name="scoring"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        {/* The person's own categories (roadmap D39), from You: a sheet like scoring. */}
        <Stack.Screen
          name="categories"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        {/* Logging is an action, not a place (roadmap D3): the "+" opens it as a
            full-height sheet over whichever tab you're on. iOS's own page
            sheet, not a formSheet: on the first device run (2026-11-07, iOS
            26) the title field sat over "New prediction" and hid the ×, with
            no keyboard up. react-native-screens resizes a formSheet's scroll
            view to the whole sheet and, on the new architecture, can place it
            at the top over a header beside it. The header now scrolls inside
            the form (app/log.tsx), and a page sheet skips that resizing
            altogether. It still swipes down, through the draft guard. */}
        <Stack.Screen name="log" options={{ presentation: 'modal' }} />
        {/* Today's practice (roadmap step 88): a task, so a sheet like Log. */}
        <Stack.Screen
          name="practice"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {/* The launch page, held a moment over the first screen (step 187). */}
      <LaunchScreen started={launched} />
      {/* The app lock and its app-switcher cover (D64), over every screen and sheet. */}
      <AppLockGate />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  // The screen for a launch that failed.
  center: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: 'center',
  },
  errorTitle: { ...type.headline, marginBottom: 8 },
  errorBody: { color: colors.textSecondary, paddingHorizontal: 24, textAlign: 'center' },
});

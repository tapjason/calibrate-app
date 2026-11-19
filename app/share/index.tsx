import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';
import { ShareCardPanel } from '@/components/share/ShareCardPanel';
import { WrappedPanel } from '@/components/share/WrappedPanel';
import { chosenProps } from '@/components/ui/chosen';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, elevation, type } from '@/constants/theme';

type Tab = 'card' | 'week' | 'year';

/** Past this the three tabs can't hold a word each at 320 pt. */
const TAB_MAX_SCALE = 1.6;

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'card', label: 'Card' },
  { key: 'week', label: 'This week' },
  { key: 'year', label: 'This year' },
];

/**
 * Share screen — the identity card and Calibration Wrapped, per the screen
 * list in CLAUDE.md. Reached from Insights, Today's identity line and You;
 * a sheet rather than a tab, since it is a thing you go do, not a place you
 * live.
 *
 * Everything here is free. There is no entitlement check on this screen and
 * there should never be one: the free tier is the marketing budget.
 */
export default function ShareScreen() {
  const router = useRouter();
  // Insights' "See your week" opens on the recap (step 173): it was found only by
  // luck under "Share my card", three rounds running (blind playtest
  // 2026-11-12f, finding 10).
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : 'card',
  );

  // Opened vs. completed is the difference between "people look at this" and
  // "people send this to someone", and only the second one is the growth loop.
  useEffect(() => {
    void track('share_opened', {
      surface: tab === 'card' ? 'card' : tab === 'week' ? 'weekly' : 'yearly',
    });
  }, [tab]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.headerRow}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Your card
            </Text>
            <Text style={styles.body}>
              Where your judgment holds up, and where it doesn&apos;t.
            </Text>
          </View>
          {/* The way out at the top (roadmap step 79). A bottom Done sat
              under two share buttons, a third capsule in a row of them. */}
          <CloseButton
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/' as never);
            }}
            testID="share-close"
          />
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              testID={`share-tab-${t.key}`}
              accessibilityRole="tab"
              {...chosenProps('tab', tab === t.key)}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
            >
              <Text
                style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}
                // Three tabs in one row at every size (D62): capped so "This
                // week" wraps between words, never inside one (code review).
                maxFontSizeMultiplier={TAB_MAX_SCALE}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'card' ? (
          <ShareCardPanel
            onUpgrade={() => router.push('/paywall?from=share_theme' as never)}
            onTakeWarmup={() => router.push('/warmup' as never)}
          />
        ) : (
          <WrappedPanel span={tab} />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 20, padding: 20, paddingBottom: 40 },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  header: { flex: 1, gap: 6 },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  tabs: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    flexDirection: 'row',
    // Three equal tabs in one row at every size (D62): stacked two and one at
    // a large text size, they read as two controls (blind playtest
    // 2026-11-13d, run 7). A long label wraps inside its tab, between words.
    gap: 4,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    // Every tab has the edge, clear on the unchosen ones, so choosing doesn't
    // move a label by a point; the padding gives the point back, so a tab is
    // the size it was before it had one (step 195).
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 7,
  },
  // Raised, as the sign-in switch's chosen segment is: the card colour, the
  // cards' shadow and an edge. Alone, surface on the sunken track was 1.19:1
  // in light and 1.13:1 in dark; textTertiary is 4.66:1 on the track (4.92:1
  // in dark) and 5.57:1 on the tab's own surface (step 195).
  tabActive: {
    ...elevation.e1,
    backgroundColor: colors.surface,
    borderColor: colors.textTertiary,
  },
  // Stretched to the tab, so a long label wraps inside it at large sizes
  // instead of running into the next one (playtest 2026-11-03, run 3).
  tabLabel: {
    ...type.subhead,
    alignSelf: 'stretch',
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabLabelActive: { color: colors.textPrimary },
});

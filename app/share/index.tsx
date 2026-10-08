import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';
import { ShareCardPanel } from '@/components/share/ShareCardPanel';
import { WrappedPanel } from '@/components/share/WrappedPanel';
import { chosenProps } from '@/components/ui/chosen';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, type } from '@/constants/theme';

type Tab = 'card' | 'week' | 'year';

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
  const [tab, setTab] = useState<Tab>('card');

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

        <View style={styles.tabs}>
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
    gap: 4,
    padding: 4,
  },
  tab: { alignItems: 'center', borderRadius: 8, flex: 1, paddingVertical: 8 },
  tabActive: { backgroundColor: colors.surface },
  tabLabel: { ...type.subhead, color: colors.textSecondary, fontWeight: '600' },
  tabLabelActive: { color: colors.textPrimary },
});

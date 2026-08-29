import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareCardPanel } from '@/components/share/ShareCardPanel';
import { WrappedPanel } from '@/components/share/WrappedPanel';
import { Button } from '@/components/ui/Button';

type Tab = 'card' | 'week' | 'year';

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'card', label: 'Card' },
  { key: 'week', label: 'This week' },
  { key: 'year', label: 'This year' },
];

/**
 * Share screen — the identity card and Calibration Wrapped, per the screen
 * list in CLAUDE.md. Reached from Stats; pushed rather than tabbed, since it
 * is a thing you go do, not a place you live.
 *
 * Everything here is free. There is no entitlement check on this screen and
 * there should never be one: the free tier is the marketing budget.
 */
export default function ShareScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('card');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Your card</Text>
          <Text style={styles.body}>
            Where your judgment holds up, and where it doesn&apos;t.
          </Text>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              testID={`share-tab-${t.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
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

        {tab === 'card' ? <ShareCardPanel /> : <WrappedPanel span={tab} />}

        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { gap: 20, padding: 20, paddingBottom: 40 },
  header: { gap: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { color: '#6b7280', fontSize: 15, lineHeight: 21 },
  tabs: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tab: { alignItems: 'center', borderRadius: 8, flex: 1, paddingVertical: 8 },
  tabActive: { backgroundColor: '#ffffff' },
  tabLabel: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
  tabLabelActive: { color: '#111827' },
});

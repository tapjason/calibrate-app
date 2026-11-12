import type Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { savedLine } from '@/components/prediction/dueWords';
import { dropsJustSaved, showsSavedNotice } from '@/components/prediction/justSavedMark';
import { LogButton } from '@/components/prediction/LogButton';
import { SavedNotice } from '@/components/prediction/SavedNotice';
import { Icon } from '@/components/ui/Icon';
import { colors, FONT_FAMILY, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Tab icon: filled when selected, outline otherwise — the iOS convention, and
 * the difference carries the selection for anyone who can't see the tint.
 * SF Symbols on iOS, Ionicons on Android and web (DESIGN_SYSTEM §5).
 */
function tabIcon(sf: [SFSymbol, SFSymbol], ion: [IoniconName, IoniconName]) {
  return ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Icon
      sf={focused ? sf[0] : sf[1]}
      fallback={focused ? ion[0] : ion[1]}
      size={size}
      color={color}
    />
  );
}

/*
 * Four tabs, Today · Insights · History · You (roadmap D3, decided
 * 2026-10-07): tabs navigate, so Log is no longer one; a "+" in the title
 * bar of Today, Insights and History opens it as a sheet (D21, 2026-10-09: it
 * floated above the tab bar until then, over buttons, cards and the chart).
 * JS tabs for now; the native Liquid Glass tabs follow the SDK 58 upgrade.
 *
 * Every tab names itself (tabBarAccessibilityLabel). Without it the name is
 * built from the tab's text content, and on web the Ionicons fallback is an
 * icon-font character, so screen readers heard it before the name (roadmap
 * step 25).
 */
export default function TabsLayout() {
  const router = useRouter();
  // Not on You: nothing there is a prediction.
  const logButton = () => <LogButton onPress={() => router.push('/log' as never)} />;
  // "Saved, due …" over Insights or History after a save there (blind
  // playtests 2026-11-12c, -12d); Today scrolls to the card instead.
  const [saved, setSaved] = useState<string | null>(null);
  const clearSaved = useCallback(() => setSaved(null), []);
  const insets = useSafeAreaInsets();
  const tabBarHeight = (Platform.OS === 'web' ? 58 : 49) + insets.bottom;

  return (
    <View style={styles.root}>
      <Tabs
        // A prediction saved over any tab but Today isn't Today's to scroll to
        // (roadmap D48): the mark goes as that tab regains focus when the sheet
        // closes. In one place, so You (a reminder's Resolve, then "Log it
        // again") and any later tab are covered.
        screenListeners={({ route }) => ({
          focus: () => {
            if (!dropsJustSaved(route.name)) return;
            const { justSavedId, pending, clearJustSaved } = usePredictionStore.getState();
            clearJustSaved();
            const due = pending.find((p) => p.id === justSavedId)?.due_date;
            if (due && showsSavedNotice(route.name)) setSaved(savedLine(due));
          },
        })}
        screenOptions={{
          headerShown: true,
          // Ink is chrome (D33): selection tint matches the icon and the CTAs.
          tabBarActiveTintColor: colors.action,
          tabBarInactiveTintColor: colors.textTertiary,
          sceneStyle: { backgroundColor: colors.canvas },
          // The face in the chrome too (D33, Instrument Sans): the header titles and the tab
          // labels aren't Text the type tokens reach.
          headerTitleStyle: { fontFamily: FONT_FAMILY, fontWeight: type.headline.fontWeight },
          tabBarLabelStyle: { fontFamily: FONT_FAMILY },
          // Web only: React Navigation's default bar is 49px with a 10px label,
          // and the 25px web icon pushes the label's descenders out of it
          // (clipped in every web screenshot until 2026-10-04). It also puts
          // text under the 11pt floor. iOS keeps the native bar and its insets.
          ...(Platform.OS === 'web'
            ? {
                tabBarStyle: { height: 58 },
                tabBarLabelStyle: {
                  fontFamily: FONT_FAMILY,
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: type.caption.fontWeight,
                },
              }
            : null),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Today', tabBarAccessibilityLabel: 'Today', headerRight: logButton, tabBarIcon: tabIcon(['sun.max.fill', 'sun.max'], ['sunny', 'sunny-outline']) }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: 'Insights',
            tabBarAccessibilityLabel: 'Insights',
            headerRight: logButton,
            tabBarIcon: tabIcon(
              ['chart.line.uptrend.xyaxis.circle.fill', 'chart.line.uptrend.xyaxis'],
              ['stats-chart', 'stats-chart-outline'],
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: 'History', tabBarAccessibilityLabel: 'History', headerRight: logButton, tabBarIcon: tabIcon(['clock.fill', 'clock'], ['time', 'time-outline']) }}
        />
        <Tabs.Screen
          name="you"
          options={{
            title: 'You',
            tabBarAccessibilityLabel: 'You',
            tabBarIcon: tabIcon(['person.crop.circle.fill', 'person.crop.circle'], ['person-circle', 'person-circle-outline']),
          }}
        />
      </Tabs>
      {saved && (
        <SavedNotice key={saved} text={saved} bottom={tabBarHeight + space.md} onDone={clearSaved} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

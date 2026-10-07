import type Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';

import { LogButton } from '@/components/prediction/LogButton';
import { Icon } from '@/components/ui/Icon';
import { colors, FONT_FAMILY, space, type } from '@/constants/theme';

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

/** The JS tab bar's height above the home indicator: 58 on web (set below), 49 on iOS. */
const TAB_BAR_HEIGHT = Platform.OS === 'web' ? 58 : 49;

/*
 * Four tabs, Today · Insights · History · You (roadmap D3, decided
 * 2026-10-07): tabs navigate, so Log is no longer one; the "+" floating above
 * the bar's trailing end opens it as a sheet. JS tabs for now; the native
 * Liquid Glass tabs follow the SDK 58 upgrade with this same layout.
 *
 * Every tab names itself (tabBarAccessibilityLabel). Without it the name is
 * built from the tab's text content, and on web the Ionicons fallback is an
 * icon-font character, so screen readers heard it before the name (roadmap
 * step 25).
 */
export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  // Not on You: nothing there is a prediction, and the "+" would sit over
  // the settings list.
  const onYou = segments[segments.length - 1] === 'you';

  return (
    <View style={styles.fill}>
      <Tabs
        screenOptions={{
          headerShown: true,
          // Indigo is chrome: selection tint matches the icon and the CTAs.
          tabBarActiveTintColor: colors.brand600,
          tabBarInactiveTintColor: colors.textTertiary,
          sceneStyle: { backgroundColor: colors.canvas },
          // Inter in the chrome too (roadmap D1): the header titles and the tab
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
          options={{ title: 'Today', tabBarAccessibilityLabel: 'Today', tabBarIcon: tabIcon(['sun.max.fill', 'sun.max'], ['sunny', 'sunny-outline']) }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: 'Insights',
            tabBarAccessibilityLabel: 'Insights',
            tabBarIcon: tabIcon(
              ['chart.line.uptrend.xyaxis.circle.fill', 'chart.line.uptrend.xyaxis'],
              ['stats-chart', 'stats-chart-outline'],
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: 'History', tabBarAccessibilityLabel: 'History', tabBarIcon: tabIcon(['clock.fill', 'clock'], ['time', 'time-outline']) }}
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
      {!onYou && (
        <LogButton
          onPress={() => router.push('/log' as never)}
          style={[styles.log, { bottom: TAB_BAR_HEIGHT + insets.bottom + space.lg }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  log: { position: 'absolute', right: space.lg },
});

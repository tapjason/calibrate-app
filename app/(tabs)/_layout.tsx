import type Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/constants/theme';

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

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // Indigo is chrome: selection tint matches the icon and the CTAs.
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.textTertiary,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon(['house.fill', 'house'], ['home', 'home-outline']) }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarIcon: tabIcon(['plus.circle.fill', 'plus.circle'], ['add-circle', 'add-circle-outline']) }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: tabIcon(
            ['chart.line.uptrend.xyaxis.circle.fill', 'chart.line.uptrend.xyaxis'],
            ['stats-chart', 'stats-chart-outline'],
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: tabIcon(['clock.fill', 'clock'], ['time', 'time-outline']) }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon(['gearshape.fill', 'gearshape'], ['settings', 'settings-outline']),
        }}
      />
    </Tabs>
  );
}

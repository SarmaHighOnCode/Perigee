import { palette, structure } from '@perigee/design-tokens';
import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={[styles.icon, focused && styles.iconActive]}>{label}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.ink,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'HOME', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="⌂" /> }} />
      <Tabs.Screen name="pending" options={{ title: 'PENDING', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="!" /> }} />
      <Tabs.Screen name="scan" options={{ title: 'SCAN', tabBarItemStyle: styles.scanItem, tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="□" /> }} />
      <Tabs.Screen name="activity" options={{ title: 'ACTIVITY', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="≡" /> }} />
      <Tabs.Screen name="more" options={{ title: 'MORE', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="•••" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.paper,
    borderTopColor: palette.ink,
    borderTopWidth: structure.borderWidth,
    height: 72,
    paddingBottom: 7,
    paddingTop: 6,
  },
  scanItem: { backgroundColor: palette.signal, borderLeftColor: palette.ink, borderLeftWidth: 2, borderRightColor: palette.ink, borderRightWidth: 2 },
  icon: { color: palette.ink, fontFamily: 'Archivo', fontSize: 18, fontWeight: '900' },
  iconActive: { transform: [{ translateY: -2 }] },
  label: { fontFamily: 'MartianMonoBold', fontSize: 9, letterSpacing: 0.2 },
});

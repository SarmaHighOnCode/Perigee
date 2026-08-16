import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  navy: '#0B132B',
  gold: '#C5A059',
  white: '#FFFFFF',
  silver: '#A3A3A3',
  dark: '#222222',
  lightGrey: '#E0E0E0',
  purple: '#6C38CC',
};

function TabIcon({
  iconName,
  text,
  focused,
  color,
  isScan = false,
  IconFamily = Ionicons
}: {
  iconName?: any;
  text: string;
  focused: boolean;
  color: string;
  isScan?: boolean;
  IconFamily?: any;
}) {
  if (isScan) {
    return (
      <View style={styles.scanWrapper}>
        <View style={styles.scanButton}>
          <Ionicons name="camera" size={32} color={COLORS.white} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabItem}>
      {iconName ? (
        <IconFamily name={iconName} size={22} color={color} style={styles.iconSpacing} />
      ) : null}
      <Text style={[styles.label, { color }]}>{text}</Text>
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.dark,
        tabBarInactiveTintColor: COLORS.silver,
        tabBarShowLabel: false,
        tabBarStyle: styles.bar,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} iconName={focused ? "home" : "home-outline"} text="Home" /> }} />
      <Tabs.Screen name="pending" options={{ title: 'Pending', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} iconName={focused ? "time" : "time-outline"} text="Pending" /> }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} text="" isScan />,
        }}
      />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} iconName={focused ? "list" : "list-outline"} text="Activity" /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} iconName={focused ? "ellipsis-horizontal" : "ellipsis-horizontal-outline"} text="More" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    height: 105,
    paddingTop: 22, // Push icons down
    paddingBottom: 24, // Safe Area Padding
    borderTopWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 12,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: 60,
  },
  iconSpacing: {
    marginBottom: 4,
  },
  label: {
    fontFamily: 'PublicSansBold',
    fontSize: 10,
    letterSpacing: 0,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.dark,
    marginTop: 4,
    position: 'absolute',
    bottom: 8,
  },
  scanWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: COLORS.gold,
    width: 72, // Increased to accommodate the thick border
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: COLORS.white, // Pure white border creates the "cutout" illusion
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  scanIcon: {
    fontFamily: 'PublicSansBold',
    fontSize: 24,
    color: COLORS.white,
  }
});

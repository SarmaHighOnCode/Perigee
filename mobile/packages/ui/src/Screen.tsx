import { palette, space, typeScale } from '@perigee/design-tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenProps extends PropsWithChildren {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  scroll?: boolean;
  tone?: 'canvas' | 'canvasSoft';
}

export function Screen({
  title,
  eyebrow,
  action,
  children,
  scroll = true,
  tone = 'canvasSoft',
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const headerNode = title || eyebrow ? (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
      <Text accessibilityRole="header" style={styles.logo}>Perigee</Text>
    </View>
  ) : null;

  const contentNode = (
    <View style={styles.content}>
      <View style={styles.body}>{children}</View>
      {action ? <View style={[styles.action, { backgroundColor: palette[tone] }]}>{action}</View> : null}
    </View>
  );
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: '#F8FAFC' }]}>
      {headerNode}
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} bounces={true}>{contentNode}</ScrollView> : contentNode}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Pure White/Frosted base
    paddingHorizontal: 24,
    // paddingTop is applied dynamically via inline styles using safe area insets
    paddingBottom: 10, // Padding below logo
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0', // Platinum hairline divider
    alignItems: 'center', // Center the logo text
    zIndex: 10, // Ensure shadow projects over body
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4, // For Android
  },
  logo: {
    color: '#000000ff', // Champagne Gold to match the branding
    fontFamily: 'LogotypeBold',
    fontSize: 34,
    letterSpacing: 1,
  },
  body: {
    flexGrow: 1,
    gap: space[4],
    padding: space[4],
    paddingBottom: 100, // Extra clearance for the floating bottom navigation bar
    zIndex: 1,
  },
  action: {
    borderTopColor: palette.hairline,
    borderTopWidth: 1,
    padding: space[4],
  },
});

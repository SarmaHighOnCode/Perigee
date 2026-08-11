import { palette, space } from '@perigee/design-tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ScreenProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  scroll?: boolean;
}

export function Screen({
  title,
  eyebrow,
  action,
  children,
  scroll = true,
}: ScreenProps) {
  const body = (
    <View style={styles.content}>
      <View style={styles.header}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    backgroundColor: palette.ink,
    gap: 4,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  eyebrow: {
    color: palette.data,
    fontFamily: 'MartianMono',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.signal,
    fontFamily: 'Archivo',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 32,
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    gap: space[4],
    padding: space[4],
  },
  action: {
    backgroundColor: palette.paper,
    borderTopColor: palette.ink,
    borderTopWidth: 3,
    padding: space[4],
  },
});

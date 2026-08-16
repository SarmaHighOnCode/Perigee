import { palette, space, structure } from '@perigee/design-tokens';
import { Screen, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const destinations = [
  ['SYSTEM DIAGNOSTICS', 'API, database and runtime config', '/settings/diagnostics'],
  ['CAMERA LAB', 'Native capture and gallery checks', '/settings/camera'],
  ['CONNECTION', 'API URL, device key and probe fixtures', '/settings/connection'],
  ['ACCESSIBILITY', 'Motion and operating conditions', '/settings/accessibility'],
  ['ABOUT & CONTACT', 'Repository, issues and build details', '/settings/about'],
] as const;

export default function MoreScreen() {
  return (
    <Screen eyebrow="DEVICE & SUPPORT" title="More">
      <SyntheticBanner compact />
      <View style={styles.list}>
        {destinations.map(([title, detail, href]) => (
          <Pressable
            accessibilityHint={detail}
            accessibilityRole="button"
            key={href}
            onPress={() => router.push(href)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.copyBlock}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.detail}>{detail}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  row: {
    alignItems: 'center', backgroundColor: palette.canvasSoft, borderColor: palette.primary,
    borderWidth: structure.borderWidth, flexDirection: 'row', gap: space[3],
    justifyContent: 'space-between', minHeight: 72, padding: space[3],
    shadowColor: palette.primary, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  pressed: { transform: [{ translateX: 4 }, { translateY: 4 }] },
  copyBlock: { flex: 1 },
  title: { color: palette.primary, fontFamily: 'Archivo', fontSize: 16, fontWeight: '900' },
  detail: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 13, lineHeight: 18, marginTop: 3 },
  arrow: { color: palette.primary, fontFamily: 'Archivo', fontSize: 24, fontWeight: '900' },
});

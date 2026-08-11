import { palette, space, structure } from '@perigee/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

export function SyntheticBanner({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.title}>SYNTHETIC DATA</Text>
      {!compact ? (
        <Text style={styles.copy}>
          Development fixtures test connectivity. They are not face-recognition results.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: palette.data,
    borderColor: palette.ink,
    borderWidth: structure.borderWidth,
    gap: 3,
    padding: space[3],
  },
  title: {
    color: palette.ink,
    fontFamily: 'Archivo',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  copy: {
    color: palette.ink,
    fontFamily: 'PublicSans',
    fontSize: 13,
    lineHeight: 18,
  },
});

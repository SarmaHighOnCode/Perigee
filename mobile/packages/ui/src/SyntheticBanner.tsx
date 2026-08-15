import { palette, space, structure } from '@perigee/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

export function SyntheticBanner({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityRole="alert" style={styles.bannerWrapper}>
      <Text style={styles.title}>SYNTHETIC DATA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrapper: {
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  title: {
    color: '#A3A3A3', // Soft Silver
    fontFamily: 'PublicSansBold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
});

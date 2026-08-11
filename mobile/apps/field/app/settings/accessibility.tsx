import { palette } from '@perigee/design-tokens';
import { Card, Screen, StatusChip } from '@perigee/ui';
import { StyleSheet, Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export default function AccessibilityScreen() {
  const reducedMotion = useReducedMotion();
  return (
    <Screen eyebrow="OPERATING CONDITIONS" title="Accessibility">
      <Card eyebrow="System preference" title="Reduced motion">
        <StatusChip label={reducedMotion ? 'REDUCED MOTION ACTIVE' : 'STANDARD MOTION ACTIVE'} tone={reducedMotion ? 'clear' : 'data'} />
        <Text style={styles.copy}>Perigee respects the Android preference. Functional progress remains visible while nonessential route and reveal movement is removed.</Text>
      </Card>
      <Card eyebrow="Field ergonomics" title="High-contrast day mode" tone="signal">
        <Text style={styles.copy}>Ink borders, solid fills and 56–64 dp actions are designed for direct sun and one-handed operation.</Text>
      </Card>
      <Card eyebrow="Never colour alone" title="Labels and structure">
        <Text style={styles.copy}>Every score band and system status carries words and a border treatment in addition to colour.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
});

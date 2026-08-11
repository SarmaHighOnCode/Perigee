import { palette, space, structure } from '@perigee/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

import { wizardSteps } from '../navigation/routes';

export function WizardProgress({ current }: { current: string }) {
  const index = wizardSteps.findIndex((step) => step.key === current);
  return (
    <View accessibilityLabel={`Enrollment step ${index + 1} of ${wizardSteps.length}`} style={styles.wrap}>
      {wizardSteps.map((step, stepIndex) => (
        <View
          key={step.key}
          style={[styles.segment, stepIndex <= index && styles.segmentActive]}
        >
          <Text style={styles.text}>{stepIndex + 1}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: space[1] },
  segment: {
    alignItems: 'center', backgroundColor: palette.bone, borderColor: palette.ink,
    borderWidth: 2, flex: 1, height: 28, justifyContent: 'center',
  },
  segmentActive: { backgroundColor: palette.signal, borderWidth: structure.borderWidth },
  text: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 10 },
});

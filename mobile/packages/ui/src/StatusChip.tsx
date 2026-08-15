import { palette, structure, type Tone, typeScale } from '@perigee/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

import { getTonePresentation } from './semantics';

export interface StatusChipProps {
  label?: string;
  tone: Tone | 'neutral';
}

export function StatusChip({ label, tone }: StatusChipProps) {
  const presentation = getTonePresentation(tone);
  return (
    <View
      accessibilityLabel={label ?? presentation.label}
      accessibilityRole="text"
      style={[styles.chip, { backgroundColor: presentation.backgroundColor }]}
    >
      <Text style={styles.label}>{label ?? presentation.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderColor: palette.hairline,
    borderRadius: 9999,
    borderWidth: structure.borderWidth,
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  label: {
    color: palette.primary,
    ...typeScale.label,
  },
});

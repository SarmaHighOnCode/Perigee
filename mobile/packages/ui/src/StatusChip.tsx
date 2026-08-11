import { palette, structure, type Tone } from '@perigee/design-tokens';
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
    borderColor: palette.ink,
    borderRadius: 999,
    borderWidth: structure.borderWidth,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    color: palette.ink,
    fontFamily: 'MartianMono',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

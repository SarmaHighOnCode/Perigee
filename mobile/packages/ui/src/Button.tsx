import {
  palette,
  structure,
  typeScale,
  type Tone,
} from '@perigee/design-tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getTonePresentation, minimumButtonHeight } from './semantics';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  tone = 'signal',
  size = 'secondary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: ButtonProps) {
  const { backgroundColor } = getTonePresentation(tone);
  const blocked = disabled || loading;
  return (
    <View style={styles.frame}>
      <View pointerEvents="none" style={styles.shadow} />
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={loading ? `${label}, working` : label}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: blocked }}
        disabled={blocked}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: blocked ? palette.bone : backgroundColor,
            minHeight: minimumButtonHeight(size),
          },
          pressed && !blocked ? styles.pressed : null,
        ]}
      >
        <Text style={styles.label}>{loading ? 'WORKING…' : label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginBottom: structure.shadowOffset,
    marginRight: structure.shadowOffset,
    position: 'relative',
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.ink,
    transform: [
      { translateX: structure.shadowOffset },
      { translateY: structure.shadowOffset },
    ],
  },
  button: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderWidth: structure.borderWidth,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pressed: {
    transform: [
      { translateX: structure.shadowOffset },
      { translateY: structure.shadowOffset },
    ],
  },
  label: {
    color: palette.ink,
    fontFamily: 'Archivo',
    ...typeScale.label,
    textAlign: 'center',
  },
});

import {
  palette,
  structure,
  typeScale,
  type Tone,
} from '@perigee/design-tokens';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { getTonePresentation, minimumButtonHeight } from './semantics';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: Tone | 'neutral';
  size?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  variant?: 'solid' | 'outline' | 'ghost';
  level?: 0 | 1 | 2 | 3 | 4;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  tone = 'signal',
  size = 'secondary',
  disabled = false,
  loading = false,
  accessibilityHint,
  variant = 'solid',
  style,
  testID,
}: ButtonProps) {
  const { backgroundColor } = getTonePresentation(tone);
  const blocked = disabled || loading;
  return (
    <View style={[styles.frame, style]}>
      <View pointerEvents="none" style={styles.shadow} />
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={loading ? `${label}, working` : label}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: blocked }}
        disabled={blocked}
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: blocked ? palette.bone : variant === 'solid' ? backgroundColor : palette.paper,
            minHeight: minimumButtonHeight(size),
          },
          pressed && !blocked ? styles.pressed : null,
          variant === 'ghost' ? styles.ghost : null,
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
  ghost: { borderWidth: 0 },
  label: {
    color: palette.ink,
    fontFamily: 'Archivo',
    ...typeScale.label,
    textAlign: 'center',
  },
});

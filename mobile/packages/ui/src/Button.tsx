import {
  palette,
  radii,
  structure,
  typeScale,
  type Tone,
} from '@perigee/design-tokens';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { minimumButtonHeight } from './semantics';

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
  tone = 'primary',
  size = 'secondary',
  disabled = false,
  loading = false,
  accessibilityHint,
  variant = 'solid',
  style,
  testID,
}: ButtonProps) {
  const blocked = disabled || loading;
  const isPrimary = tone === 'primary';
  const backgroundColor = isPrimary ? palette.primary : palette.canvas;
  const textColor = isPrimary ? palette.onPrimary : palette.primary;

  return (
    <View style={[styles.frame, style]}>
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
            backgroundColor: blocked ? palette.hairline : backgroundColor,
            minHeight: minimumButtonHeight(size),
            borderColor: isPrimary ? 'transparent' : palette.hairline,
            borderWidth: isPrimary ? 0 : 1,
          },
          pressed && !blocked ? styles.pressed : null,
          variant === 'ghost' ? styles.ghost : null,
        ]}
      >
        <Text style={[styles.label, { color: textColor }]}>
          {loading ? 'Working…' : label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pressed: {
    opacity: 0.8,
  },
  ghost: { borderWidth: 0, backgroundColor: 'transparent' },
  label: {
    fontFamily: 'Archivo',
    ...typeScale.bodySmall,
    fontWeight: '500',
    textAlign: 'center',
  },
});

import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { palette, structure, type Tone } from '../theme';

interface BrutProps extends PropsWithChildren {
  tone?: Tone;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Brut({ children, tone = 'paper', shadow = true, style }: BrutProps) {
  return (
    <View style={[styles.shell, shadow && styles.shellWithShadow]}>
      <View
        style={[
          styles.surface,
          { backgroundColor: palette[tone] },
          shadow && styles.raised,
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
  },
  shellWithShadow: {
    backgroundColor: palette.ink,
    marginBottom: structure.shadowOffset,
    marginRight: structure.shadowOffset,
  },
  surface: {
    borderColor: palette.ink,
    borderWidth: structure.borderWidth,
  },
  raised: {
    transform: [
      { translateX: -structure.shadowOffset },
      { translateY: -structure.shadowOffset },
    ],
  },
});

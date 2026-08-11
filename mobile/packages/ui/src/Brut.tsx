import { palette, structure, type Tone } from '@perigee/design-tokens';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getTonePresentation } from './semantics';

export interface BrutProps extends PropsWithChildren {
  tone?: Tone;
  shadow?: 0 | 3 | 5 | 8 | 12;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Brut({
  children,
  tone = 'neutral',
  shadow = structure.shadowOffset,
  style,
  contentStyle,
}: BrutProps) {
  const { backgroundColor } = getTonePresentation(tone);
  return (
    <View style={[styles.frame, style]}>
      {shadow > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.shadow,
            { transform: [{ translateX: shadow }, { translateY: shadow }] },
          ]}
        />
      ) : null}
      <View style={[styles.content, { backgroundColor }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.ink,
  },
  content: {
    borderColor: palette.ink,
    borderWidth: structure.borderWidth,
  },
});

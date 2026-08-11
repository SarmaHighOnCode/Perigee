import { elevation, palette, structure, type ElevationLevel, type Tone } from '@perigee/design-tokens';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getTonePresentation } from './semantics';

export interface BrutProps extends PropsWithChildren {
  tone?: Tone | 'neutral';
  shadow?: 0 | 3 | 5 | 8 | 12 | boolean;
  level?: ElevationLevel;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Brut({
  children,
  tone = 'neutral',
  shadow = structure.shadowOffset,
  level = 2,
  pressed = false,
  style,
  contentStyle,
}: BrutProps) {
  const { backgroundColor } = getTonePresentation(tone);
  const offset = shadow === false ? 0 : shadow === true ? elevation[level].offset : shadow;
  return (
    <View style={[styles.frame, style]}>
      {offset > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.shadow,
            { transform: [{ translateX: offset }, { translateY: offset }] },
          ]}
        />
      ) : null}
      <View style={[styles.content, { backgroundColor }, pressed && { transform: [{ translateX: offset }, { translateY: offset }] }, contentStyle]}>
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

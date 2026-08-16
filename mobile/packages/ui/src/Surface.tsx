import { elevation, palette, structure, type ElevationLevel, type Tone } from '@perigee/design-tokens';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getTonePresentation } from './semantics';

export interface SurfaceProps extends PropsWithChildren {
  tone?: Tone | 'neutral';
  shadow?: boolean;
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
}

export function Surface({
  children,
  tone = 'neutral',
  shadow = true,
  level = 2,
  style,
  contentStyle,
  radius = 8,
}: SurfaceProps) {
  const { backgroundColor } = getTonePresentation(tone);
  const elv = shadow ? elevation[level].elevation : 0;
  
  return (
    <View style={[
      styles.frame, 
      { backgroundColor, borderRadius: radius, elevation: elv }, 
      elv > 0 && styles.shadowFallback,
      style, 
      contentStyle
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: palette.hairline,
    borderWidth: structure.borderWidth,
    overflow: 'hidden',
  },
  shadowFallback: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  }
});

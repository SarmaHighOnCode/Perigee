import { palette, space, typeScale, radii, type ElevationLevel } from '@perigee/design-tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Surface, type SurfaceProps } from './Surface';

export interface CardProps extends PropsWithChildren {
  title?: string;
  eyebrow?: string;
  trailing?: ReactNode;
  tone?: SurfaceProps['tone'];
  shadow?: SurfaceProps['shadow'];
  accent?: SurfaceProps['tone'];
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  title,
  eyebrow,
  trailing,
  tone = 'neutral',
  shadow = true,
  level = 2,
  style,
}: CardProps) {
  return (
    <Surface shadow={shadow} tone={tone} level={level} radius={radii.md} style={style}>
      <View style={styles.body}>
        {eyebrow || title || trailing ? (
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              {title ? <Text style={styles.title}>{title}</Text> : null}
            </View>
            {trailing}
          </View>
        ) : null}
        {children}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space[3],
    padding: space[4],
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'space-between',
  },
  headingCopy: {
    flex: 1,
  },
  eyebrow: {
    color: palette.primary,
    ...typeScale.label,
    fontWeight: '600',
    opacity: 0.7,
  },
  title: {
    color: palette.primary,
    ...typeScale.h2,
    marginTop: 3,
  },
});

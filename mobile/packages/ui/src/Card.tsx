import { palette, space, type ElevationLevel } from '@perigee/design-tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brut, type BrutProps } from './Brut';

export interface CardProps extends PropsWithChildren {
  title?: string;
  eyebrow?: string;
  trailing?: ReactNode;
  tone?: BrutProps['tone'];
  shadow?: BrutProps['shadow'];
  accent?: BrutProps['tone'];
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  title,
  eyebrow,
  trailing,
  tone = 'neutral',
  shadow = 5,
  level = 2,
  style,
}: CardProps) {
  return (
    <Brut shadow={shadow} tone={tone} level={level} style={style}>
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
    </Brut>
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
    color: palette.ink,
    fontFamily: 'MartianMono',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.ink,
    fontFamily: 'Archivo',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 3,
    textTransform: 'uppercase',
  },
});

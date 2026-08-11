import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  fonts,
  palette,
  scale,
  space,
  structure,
  type ElevationLevel,
  type Tone,
} from '@perigee/design-tokens';

import { Brut } from './Brut';

export interface CardProps extends PropsWithChildren {
  tone?: Tone;
  /** Renders an accent header strip. Omit for a plain card. */
  title?: string;
  /** Strip fill. Text on it is always `ink` — docs/07 §3. */
  accent?: Tone;
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

/** Elevation 2, `ink` border, optional accent header strip — docs/07 §7. */
export function Card({
  children,
  tone = 'paper',
  title,
  accent = 'signal',
  level = 2,
  style,
}: CardProps) {
  return (
    <Brut tone={tone} level={level} style={style}>
      {title === undefined ? null : (
        <View style={[styles.strip, { backgroundColor: palette[accent] }]}>
          <Text style={styles.stripLabel} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
      <View style={styles.body}>{children}</View>
    </Brut>
  );
}

const styles = StyleSheet.create({
  strip: {
    borderBottomWidth: structure.borderWidth,
    borderBottomColor: palette.ink,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  stripLabel: {
    fontFamily: fonts.display,
    fontSize: scale.label.size,
    lineHeight: scale.label.lh,
    fontWeight: scale.label.weight,
    letterSpacing: scale.label.tracking,
    textTransform: scale.label.transform,
    color: palette.ink,
  },
  body: {
    padding: space[4],
  },
});

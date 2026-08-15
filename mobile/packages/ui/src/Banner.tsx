import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  fonts,
  palette,
  scale,
  space,
  touch,
  type ElevationLevel,
  type Tone,
} from '@perigee/design-tokens';

import { Surface } from './Surface';

export interface BannerProps extends PropsWithChildren {
  title: string;
  message?: string;
  tone?: Tone;
  /**
   * Defaults to `false`, and that is the point. An advisory an officer can
   * swipe away is an advisory that stops being read — docs/07 §7.
   */
  dismissible?: boolean;
  onDismiss?: () => void;
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

/** Hard-bordered advisory block. Non-dismissible unless explicitly told otherwise. */
export function Banner({
  children,
  title,
  message,
  tone = 'signal',
  dismissible = false,
  onDismiss,
  level = 3,
  style,
}: BannerProps) {
  const showDismiss = dismissible && onDismiss !== undefined;

  return (
    <Surface tone={tone} level={level} style={[styles.surface, style]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message === undefined ? null : <Text style={styles.message}>{message}</Text>}
          {children}
        </View>
        {showDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${title}`}
            onPress={onDismiss}
            style={styles.dismiss}
          >
            <Text style={styles.dismissGlyph}>×</Text>
          </Pressable>
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: space[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: scale.h2.size,
    lineHeight: scale.h2.lh,
    fontWeight: scale.h2.weight,
    letterSpacing: scale.h2.tracking,
    textTransform: scale.h2.transform,
    color: palette.primary,
  },
  message: {
    marginTop: space[2],
    fontFamily: fonts.body,
    fontSize: scale.body.size,
    lineHeight: scale.body.lh,
    fontWeight: scale.body.weight,
    color: palette.primary,
  },
  dismiss: {
    width: touch.icon,
    height: touch.icon,
    marginLeft: space[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissGlyph: {
    fontFamily: fonts.display,
    fontSize: scale.h2.size,
    lineHeight: scale.h2.lh,
    fontWeight: scale.h2.weight,
    color: palette.primary,
  },
});

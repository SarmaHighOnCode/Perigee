import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import {
  elevation,
  palette,
  structure,
  type ElevationLevel,
  type Tone,
} from '@perigee/design-tokens';

export interface BrutProps extends PropsWithChildren {
  /** Surface fill. Borders and shadows are always `ink` — docs/07 §4. */
  tone?: Tone;
  /** Draw the offset shadow at all. `false` renders flush. */
  shadow?: boolean;
  /** docs/07 §4 elevation table. 2 is the default for cards and buttons. */
  level?: ElevationLevel;
  /**
   * Collapse the shadow and translate the surface into it — the press
   * interaction from docs/07 §6. The layout box does not move, so nothing
   * around the element shifts.
   */
  pressed?: boolean;
  /**
   * Applied to the bordered surface — padding, radius, size, fill overrides.
   * Not to the layout box: margins and `alignSelf` belong on a wrapper, or the
   * surface detaches from its shadow. A transparent fill here will show the
   * shadow through the surface unless `shadow` is `false`.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Border + offset shadow. Every other component in this package wraps it.
 *
 * The shadow is a solid `ink` sibling translated bottom-right, not Android's
 * `elevation` prop: `elevation` renders a blurred shadow, which is precisely
 * the thing this design system exists to avoid (docs/07 §4). The sibling
 * technique also behaves identically on both React Native architectures.
 */
export function Brut({
  children,
  tone = 'paper',
  shadow = true,
  level = 2,
  pressed = false,
  style,
}: BrutProps) {
  const offset = shadow ? elevation[level].offset : 0;
  const collapse = pressed && offset > 0;

  return (
    <View
      style={[styles.root, offset > 0 && { marginRight: offset, marginBottom: offset }]}
    >
      {offset > 0 ? (
        <View
          style={[
            styles.shadow,
            { transform: [{ translateX: offset }, { translateY: offset }] },
            collapse && styles.shadowCollapsed,
          ]}
        />
      ) : null}
      <View
        style={[
          styles.surface,
          { backgroundColor: palette[tone] },
          collapse && { transform: [{ translateX: offset }, { translateY: offset }] },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.ink,
  },
  shadowCollapsed: {
    opacity: 0,
  },
  surface: {
    borderWidth: structure.borderWidth,
    borderColor: palette.ink,
    borderRadius: structure.radius.none,
  },
});

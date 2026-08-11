import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  fonts,
  palette,
  scale,
  space,
  touch,
  type ElevationLevel,
  type Tone,
} from '@perigee/design-tokens';

import { Brut } from './Brut';

export type ButtonVariant = 'solid' | 'outline' | 'ghost';
export type ButtonSize = 'primary' | 'secondary';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * `solid` fills with `tone`; `outline` is a `paper` fill with the same border
   * and shadow; `ghost` is bare text. `tone` deliberately only affects a fill —
   * an accent used as *text* on `paper` fails the contrast audit in docs/07 §3,
   * so the label is always `ink`.
   */
  variant?: ButtonVariant;
  tone?: Tone;
  /** 64 dp primary, 56 dp secondary — docs/07 §5 touch targets. */
  size?: ButtonSize;
  level?: ElevationLevel;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * On press the element translates into its own shadow and the shadow collapses
 * — docs/07 §6, signature interaction 1. The transition is a hard cut rather
 * than an eased one, which is both correct for the motion grammar and what a
 * reduce-motion user would get regardless.
 *
 * Disabled goes flush (elevation 0) on a `bone` fill rather than dimming:
 * docs/07 §1 rules out low-opacity text, which has to survive direct sunlight.
 */
export function Button({
  label,
  onPress,
  variant = 'solid',
  tone = 'signal',
  size = 'primary',
  level = 2,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const height = size === 'primary' ? touch.primary : touch.secondary;
  const fill: Tone = disabled ? 'bone' : tone;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      {({ pressed }) => (
        <Brut
          tone={variant === 'solid' ? fill : 'paper'}
          shadow={variant !== 'ghost' && !disabled}
          level={level}
          pressed={pressed}
          style={[styles.surface, { minHeight: height }, variant === 'ghost' && styles.ghost]}
        >
          <Text
            style={size === 'primary' ? styles.labelPrimary : styles.labelSecondary}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Brut>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  ghost: {
    // Safe to go transparent only because `ghost` draws no shadow — a
    // transparent surface over a shadow sibling would show the ink through it.
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  labelPrimary: {
    fontFamily: fonts.display,
    fontSize: scale.h2.size,
    lineHeight: scale.h2.lh,
    fontWeight: scale.h2.weight,
    letterSpacing: scale.h2.tracking,
    textTransform: scale.h2.transform,
    color: palette.ink,
  },
  labelSecondary: {
    fontFamily: fonts.display,
    fontSize: scale.label.size,
    lineHeight: scale.label.lh,
    fontWeight: scale.label.weight,
    letterSpacing: scale.label.tracking,
    textTransform: scale.label.transform,
    color: palette.ink,
  },
});

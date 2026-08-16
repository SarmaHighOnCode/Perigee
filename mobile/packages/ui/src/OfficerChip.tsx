import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette, radii, scale, space, structure } from '@perigee/design-tokens';

import { Surface } from './Surface';
import { officerChipLabel } from './logic';

export interface OfficerChipProps {
  /** e.g. `OFFICER-1147`. */
  officerId: string;
  /** e.g. `ROUTINE CHECK`. */
  context?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * `SEARCHING AS OFFICER-1147`, always visible during a search — docs/07 §7.
 * The officer's asserted identity stays on screen because everything the
 * system does is attributed to it.
 */
export function OfficerChip({ officerId, context, style }: OfficerChipProps) {
  const label = officerChipLabel(officerId, context);

  return (
    // The wrapper carries the layout: `<Surface>`'s style lands on its surface,
    // and `alignSelf` there would not reach the element that gets laid out.
    <View style={[styles.wrap, style]}>
      <Surface tone="data" level={1} style={styles.surface}>
        <Text accessibilityLabel={label} style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  surface: {
    borderRadius: radii.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  label: {
    fontFamily: fonts.data,
    fontSize: scale.mono.size,
    lineHeight: scale.mono.lh,
    fontWeight: scale.mono.weight,
    color: palette.primary,
  },
});

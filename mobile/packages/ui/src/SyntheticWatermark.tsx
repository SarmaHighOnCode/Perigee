import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette, scale } from '@perigee/design-tokens';

import { isWatermarkVisible, watermarkRow, type DatasetMode } from './logic';

const ROWS = 18;
const REPEATS_PER_ROW = 6;
const OVERHANG = 240;

const ROW_INDEXES = Array.from({ length: ROWS }, (_, index) => index);

export interface SyntheticWatermarkProps {
  /**
   * The `dataset_mode` field carried on every API response. This is the only
   * input: there is deliberately no prop that turns the watermark off.
   */
  datasetMode: DatasetMode;
}

/**
 * Diagonal repeating `SYNTHETIC DATA` at 8% opacity, above everything, mounted
 * at the root of the app — docs/07 §7.
 *
 * This is an ethical constraint rather than a style choice. If a screenshot of
 * this app circulates it must be impossible to mistake for an operational
 * system, and that guarantee has to be structural, because screenshots escape.
 * Adding an `enabled`, `hidden` or `opacity` prop here defeats the component.
 */
export function SyntheticWatermark({ datasetMode }: SyntheticWatermarkProps) {
  if (!isWatermarkVisible(datasetMode)) return null;

  const row = watermarkRow(REPEATS_PER_ROW);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.overlay}
    >
      <View style={styles.canvas}>
        {ROW_INDEXES.map((index) => (
          <Text key={index} style={styles.row} numberOfLines={1}>
            {row}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    top: -OVERHANG,
    right: -OVERHANG,
    bottom: -OVERHANG,
    left: -OVERHANG,
    justifyContent: 'space-around',
    opacity: 0.08,
    transform: [{ rotate: '-30deg' }],
  },
  row: {
    fontFamily: fonts.display,
    fontSize: scale.h2.size,
    lineHeight: scale.h2.lh,
    fontWeight: scale.h2.weight,
    letterSpacing: scale.h2.tracking,
    color: palette.ink,
  },
});

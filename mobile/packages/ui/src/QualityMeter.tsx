import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette, scale, space } from '@perigee/design-tokens';

import { Brut } from './Brut';
import { QUALITY_SEGMENTS, qualitySegments, qualityTone } from './logic';

const SEGMENTS = Array.from({ length: QUALITY_SEGMENTS }, (_, index) => index);

export interface QualityMeterProps {
  /** Capture quality in 0..1. */
  quality: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Five discrete blocks, never a smooth bar — docs/07 §7. A continuous bar
 * implies a precision the quality score does not have; discrete reads as
 * measured.
 */
export function QualityMeter({ quality, label, style }: QualityMeterProps) {
  const filled = qualitySegments(quality);
  const tone = qualityTone(filled);

  return (
    <View style={style}>
      {label === undefined ? null : (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Capture quality ${filled} of ${QUALITY_SEGMENTS}`}
        accessibilityValue={{ min: 0, max: QUALITY_SEGMENTS, now: filled }}
        style={styles.track}
      >
        {SEGMENTS.map((index) => (
          <View key={index} style={styles.slot}>
            <Brut
              tone={index < filled ? tone : 'paper'}
              shadow={false}
              style={styles.block}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: space[2],
    fontFamily: fonts.display,
    fontSize: scale.label.size,
    lineHeight: scale.label.lh,
    fontWeight: scale.label.weight,
    letterSpacing: scale.label.tracking,
    textTransform: scale.label.transform,
    color: palette.ink,
  },
  track: {
    flexDirection: 'row',
    gap: space[1],
  },
  slot: {
    flex: 1,
  },
  block: {
    height: space[6],
  },
});

import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';

import {
  fonts,
  palette,
  scale,
  space,
  type Band,
  type ElevationLevel,
} from '@perigee/design-tokens';

import { Brut } from './Brut';
import { bandLabel, bandTone, formatScore } from './logic';

export interface ScoreBadgeProps {
  /** Cosine similarity from the search response. */
  similarity: number;
  band: Band;
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

/**
 * Martian Mono with `tabular-nums`, four decimal places, band-coloured fill,
 * `ink` text — docs/07 §2 and §7.
 *
 * The band label is rendered alongside the number rather than left to the
 * fill colour: colour is never the sole channel (docs/07 §3).
 */
export function ScoreBadge({ similarity, band, level = 1, style }: ScoreBadgeProps) {
  return (
    <Brut
      tone={bandTone(band)}
      level={level}
      style={[styles.surface, style]}
    >
      <Text
        accessibilityLabel={`Similarity ${formatScore(similarity)}`}
        style={styles.score}
        numberOfLines={1}
      >
        {formatScore(similarity)}
      </Text>
      <Text style={styles.band} numberOfLines={2}>
        {bandLabel(band)}
      </Text>
    </Brut>
  );
}

const styles = StyleSheet.create({
  surface: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    alignItems: 'center',
  },
  score: {
    fontFamily: fonts.data,
    fontSize: scale.score.size,
    lineHeight: scale.score.lh,
    fontWeight: scale.score.weight,
    // Non-negotiable: proportional digits turn a glance into a reading task.
    fontVariant: ['tabular-nums'],
    color: palette.ink,
  },
  band: {
    fontFamily: fonts.display,
    fontSize: scale.label.size,
    lineHeight: scale.label.lh,
    fontWeight: scale.label.weight,
    letterSpacing: scale.label.tracking,
    textTransform: scale.label.transform,
    textAlign: 'center',
    color: palette.ink,
  },
});

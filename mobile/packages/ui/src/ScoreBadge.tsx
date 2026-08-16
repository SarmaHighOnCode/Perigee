import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';

import {
  palette,
  radii,
  scale,
  space,
  type Band,
  type ElevationLevel,
} from '@perigee/design-tokens';

import { Surface } from './Surface';
import { bandLabel, bandTone, formatScore } from './logic';

export interface ScoreBadgeProps {
  /** Cosine similarity from the search response. */
  similarity: number;
  band: Band;
  level?: ElevationLevel;
  style?: StyleProp<ViewStyle>;
}

export function ScoreBadge({ similarity, band, level = 1, style }: ScoreBadgeProps) {
  return (
    <Surface
      tone={bandTone(band)}
      level={level}
      radius={radii.md}
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
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    alignItems: 'center',
  },
  score: {
    fontFamily: scale.score.font === 'data' ? undefined : 'MartianMono',
    fontSize: scale.score.size,
    lineHeight: scale.score.lh,
    fontWeight: scale.score.weight as any,
    // Non-negotiable: proportional digits turn a glance into a reading task.
    fontVariant: ['tabular-nums'],
    color: palette.primary,
  },
  band: {
    fontSize: scale.label.size,
    lineHeight: scale.label.lh,
    fontWeight: scale.label.weight as any,
    letterSpacing: scale.label.tracking,
    textAlign: 'center',
    color: palette.primary,
  },
});

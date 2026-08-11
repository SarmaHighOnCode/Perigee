import type { StyleProp, ViewStyle } from 'react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  fonts,
  palette,
  scale,
  space,
  structure,
  touch,
  type Band,
} from '@perigee/design-tokens';

import { Brut } from './Brut';
import { ScoreBadge } from './ScoreBadge';
import { bandLabel, formatScore, maskName } from './logic';

export interface CandidateTileProps {
  /** `masked_name` from the API. Re-masking an already-masked name is a no-op. */
  name: string;
  similarity: number;
  band: Band;
  /** Mugshot URI. A bordered blank stands in when there is no image. */
  imageUri?: string;
  /** Secondary line, e.g. `26-35 · BLR STH`. */
  meta?: string;
  /** The officer has picked this one as the subject of a CONFIRMED decision. */
  selected?: boolean;
  /**
   * One of two candidates within the ambiguity gap. Both are marked so the
   * officer sees the collision before reading the banner — a small score gap
   * is the classic misidentification setup.
   */
  ambiguous?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Full width × 96 dp — the most consequential tap in the app, so it gets the
 * largest tap zone in docs/07 §5.
 */
export function CandidateTile({
  name,
  similarity,
  band,
  imageUri,
  meta,
  selected = false,
  ambiguous = false,
  onPress,
  style,
  testID,
}: CandidateTileProps) {
  const masked = maskName(name);
  const label = [
    masked,
    `similarity ${formatScore(similarity)}`,
    bandLabel(band),
    selected ? 'selected' : null,
    ambiguous ? 'ambiguous with another candidate' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      disabled={onPress === undefined}
      onPress={onPress}
      style={[styles.pressable, style]}
    >
      {({ pressed }) => (
        <Brut
          tone={selected ? "signal" : "paper"}
          level={selected ? 3 : 2}
          pressed={pressed}
          style={[styles.surface, ambiguous ? styles.ambiguous : null]}
        >
          {imageUri === undefined ? (
            <View style={[styles.mugshot, styles.mugshotEmpty]} />
          ) : (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: imageUri }}
              style={styles.mugshot}
            />
          )}
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>
              {masked}
            </Text>
            {meta === undefined ? null : (
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            )}
          </View>
          <ScoreBadge similarity={similarity} band={band} style={styles.badge} />
        </Brut>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
  },
  surface: {
    height: touch.candidate,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: space[2],
  },
  mugshot: {
    width: touch.candidate - structure.borderWidth * 2,
    height: '100%',
    borderRightWidth: structure.borderWidth,
    borderRightColor: palette.ink,
    backgroundColor: palette.bone,
  },
  mugshotEmpty: {
    backgroundColor: palette.slab,
  },
  identity: {
    flex: 1,
    paddingHorizontal: space[3],
  },
  name: {
    fontFamily: fonts.display,
    fontSize: scale.h2.size,
    lineHeight: scale.h2.lh,
    fontWeight: scale.h2.weight,
    letterSpacing: scale.h2.tracking,
    textTransform: scale.h2.transform,
    color: palette.ink,
  },
  meta: {
    marginTop: space[1],
    fontFamily: fonts.data,
    fontSize: scale.mono.size,
    lineHeight: scale.mono.lh,
    fontWeight: scale.mono.weight,
    color: palette.ink,
  },
  badge: {
    minWidth: space[24],
  },
  // Colour is never the sole channel: the accessibility label also says
  // "ambiguous with another candidate".
  ambiguous: {
    borderColor: palette.alert,
    borderWidth: structure.borderWidth,
  },
});

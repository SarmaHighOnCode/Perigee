import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme';
import type { CheckStatus } from '../types';

const STATUS_TONE: Record<CheckStatus, string> = {
  PASS: palette.clear,
  FAIL: palette.alert,
  UNSUPPORTED: palette.warn,
  NOT_TESTED: palette.data,
};

interface StatusChipProps {
  status: CheckStatus;
  label?: string;
}

export function StatusChip({ status, label }: StatusChipProps) {
  return (
    <View
      accessibilityLabel={`${label ? `${label}: ` : ''}${status}`}
      style={[styles.chip, { backgroundColor: STATUS_TONE[status] }]}
    >
      <Text style={styles.text}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderColor: palette.ink,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});

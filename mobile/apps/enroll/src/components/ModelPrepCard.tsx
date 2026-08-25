import { palette } from '@perigee/design-tokens';
import { Button, Card, StatusChip } from '@perigee/ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { modelPreloadSummary, useModelPreload } from '../services/modelPreload';

export function ModelPrepCard() {
  const status = useModelPreload((state) => state.status);
  const progress = useModelPreload((state) => state.progress);
  const error = useModelPreload((state) => state.error);
  const start = useModelPreload((state) => state.start);

  if (status === 'ready') return null;

  if (status === 'failed') {
    return (
      <Card eyebrow="Face models" title="Download failed" tone="alert">
        <Text style={styles.copy}>{error}</Text>
        <Button label="RETRY DOWNLOAD" onPress={start} tone="alert" />
      </Card>
    );
  }

  return (
    <Card eyebrow="Face models" title={status === 'preparing' ? 'Preparing face recognition' : 'Face models pending'} tone="data">
      <View style={styles.row}>
        <StatusChip label={status === 'preparing' ? modelPreloadSummary(progress).toUpperCase() : 'STARTING'} tone="data" />
        <ActivityIndicator color={palette.signal} size="small" />
      </View>
      <Text style={styles.copy}>
        First run downloads ~190 MB of recognition models over Wi-Fi. This happens once; captures already taken are analysed as soon as it finishes.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 13, lineHeight: 19 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
});

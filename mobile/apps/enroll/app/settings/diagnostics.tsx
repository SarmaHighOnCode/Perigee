import { CameraStage, formatBytes, normalizeMedia, type MediaRecord } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';

export default function DiagnosticsScreen() {
  const client = usePerigeeClient();
  const [backend, setBackend] = useState<string>('NOT TESTED');
  const [media, setMedia] = useState<MediaRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkBackend() {
    try {
      const [health, ready, config] = await Promise.all([client.health(), client.ready(), client.config()]);
      setBackend(`${health.status} · DB ${ready.database} · STORAGE ${ready.storage} · ${config.dataset_mode}`.toUpperCase());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBackend('FAILED');
    }
  }

  async function importOriginal() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      setMedia(normalizeMedia({
        uri: asset.uri, width: asset.width, height: asset.height, bytes: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null, source: 'gallery', acquiredAt: new Date().toISOString(),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen eyebrow="On-device proof" title="Diagnostics">
      <SyntheticBanner compact />
      <Card eyebrow="API" title="Backend contract" trailing={<StatusChip label={backend} tone={backend === 'FAILED' ? 'alert' : backend === 'NOT TESTED' ? 'neutral' : 'clear'} />}>
        <Button label="RUN HEALTH / READY / CONFIG" onPress={() => void checkBackend()} tone="data" />
      </Card>
      <Card eyebrow="Native pipeline" title="Camera & gallery">
        <Text style={styles.copy}>This is the same maximum-quality VisionCamera stage used by both production apps and Camera Lab.</Text>
      </Card>
      <CameraStage compact onCapture={({ media: captured }) => setMedia(captured)} onError={setError} />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void importOriginal()} tone="data" />
      {media ? <Card eyebrow={media.source} title={`${media.width ?? '?'} × ${media.height ?? '?'}`} tone="clear"><Text style={styles.copy}>{formatBytes(media.bytes)} · {media.mimeType} · {media.megapixels ?? '?'} MP</Text></Card> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

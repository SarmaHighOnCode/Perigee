import { CameraStage, formatBytes, normalizeMedia, type MediaRecord } from '@perigee/camera';
import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function CameraDiagnosticsScreen() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [media, setMedia] = useState<MediaRecord | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setMedia(normalizeMedia({
      uri: asset.uri, width: asset.width, height: asset.height, bytes: asset.fileSize ?? null,
      mimeType: asset.mimeType ?? null, source: 'gallery', acquiredAt: new Date().toISOString(),
    }));
  }

  async function saveGallery() {
    if (!media || media.source !== 'camera') return;
    let next = permission;
    if (!next?.granted) next = await requestPermission();
    if (!next?.granted) throw new Error('Media-library permission was not granted');
    await MediaLibrary.saveToLibraryAsync(media.uri);
  }

  return (
    <Screen eyebrow="NATIVE CAMERA LAB" title="Camera checks">
      <View style={styles.statuses}>
        <StatusChip label="VISIONCAMERA 5" tone="clear" />
        <StatusChip label="PROCESSED JPEG" tone="data" />
      </View>
      <CameraStage
        compact
        onCapture={({ media: captured, latencyMs }) => {
          setMedia(captured);
          setLatency(latencyMs);
        }}
        onError={setError}
      />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void pickGallery()} tone="data" />
      {media ? (
        <Card eyebrow={media.source.toUpperCase()} title="Latest media">
          <View style={styles.previewFrame}><Image contentFit="contain" source={{ uri: media.uri }} style={styles.preview} /></View>
          <Text style={styles.data}>{media.width ?? '?'} × {media.height ?? '?'} · {media.megapixels ?? '?'} MP</Text>
          <Text style={styles.data}>{formatBytes(media.bytes)} · {latency?.toFixed(1) ?? '?'} MS</Text>
          {media.source === 'camera' ? <Button label="SAVE TO PHONE GALLERY" onPress={() => void saveGallery().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))} tone="clear" /> : null}
        </Card>
      ) : null}
      <Card eyebrow="Evidence boundary" title="Emulator is functional proof" tone="warn">
        <Text style={styles.copy}>The Pixel 7 emulator proves permissions, lifecycle and output wiring. Judge lighting, detail and OEM post-processing only on a physical phone using matched scenes.</Text>
      </Card>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  previewFrame: { backgroundColor: palette.primary, borderColor: palette.primary, borderWidth: structure.borderWidth, height: 260 },
  preview: { flex: 1 },
  data: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 12 },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

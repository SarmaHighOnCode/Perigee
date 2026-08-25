import { CameraStage, normalizeMedia } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import { Button, Screen, SyntheticBanner } from '@perigee/ui';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useFieldStore } from '../../src/state/fieldStore';

export default function CaptureScreen() {
  const setMedia = useFieldStore((state) => state.setMedia);
  const setProbe = useFieldStore((state) => state.setProbe);
  const [error, setError] = useState<string | null>(null);

  async function importFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 1,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      // A capture that never got embedded shouldn't leave a stale probe
      // behind for the next photo to silently inherit.
      setProbe(null);
      setMedia(normalizeMedia({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        bytes: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        source: 'gallery',
        acquiredAt: new Date().toISOString(),
      }));
      router.push('/scan/review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen eyebrow="STEP 1 · LOCAL MEDIA" title="Capture probe">
      <SyntheticBanner compact />
      <CameraStage
        compact
        onCapture={({ media }) => {
          setProbe(null);
          setMedia(media);
          router.push('/scan/review');
        }}
        onError={setError}
      />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void importFromGallery()} tone="data" />
      <Button label="CANCEL" onPress={() => router.back()} tone="neutral" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: {
    backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3,
    color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3],
  },
});

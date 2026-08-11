import { CameraStage, normalizeMedia } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { setCapture, type RequiredCaptureAngle } from '../domain/draft';
import { activeDraft, useEnrollStore } from '../state/enrollStore';
import { WizardProgress } from './WizardProgress';

const labels: Record<RequiredCaptureAngle, { title: string; cue: string; step: string }> = {
  frontal: { title: 'Capture front', cue: 'Face camera directly. Keep eyes level and the full face inside the guide.', step: 'frontal' },
  left: { title: 'Capture left', cue: 'Turn the subject left approximately 45°. Keep both eyes visible.', step: 'left' },
  right: { title: 'Capture right', cue: 'Turn the subject right approximately 45°. Keep both eyes visible.', step: 'right' },
};

export function CaptureStep({ angle, nextHref }: { angle: RequiredCaptureAngle; nextHref: Href }) {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [error, setError] = useState<string | null>(null);
  const label = labels[angle];
  const current = draft?.captures[angle];

  function storeMedia(media: ReturnType<typeof normalizeMedia>) {
    if (!draft) return;
    saveDraft(setCapture(draft, {
      angle,
      uri: media.uri,
      width: media.width,
      height: media.height,
      bytes: media.bytes,
      mimeType: media.mimeType,
      source: media.source,
      acquiredAt: media.acquiredAt,
    }));
  }

  async function importOriginal() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 1,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      storeMedia(normalizeMedia({
        uri: asset.uri, width: asset.width, height: asset.height,
        bytes: asset.fileSize ?? null, mimeType: asset.mimeType ?? null,
        source: 'gallery', acquiredAt: new Date().toISOString(),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (!draft) {
    return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  }

  return (
    <Screen
      action={<Button disabled={!current} label="SAVE & CONTINUE" onPress={() => router.push(nextHref)} size="primary" />}
      eyebrow="Enrollment capture"
      title={label.title}
    >
      <WizardProgress current={label.step} />
      <Card eyebrow="Pose guide" title={angle} tone="data">
        <Text style={styles.copy}>{label.cue}</Text>
        <StatusChip label="POSE SCORING DEFERRED" tone="warn" />
        <Text style={styles.note}>Capture uses native phone processing at maximum JPEG quality. No face embedding or biometric quality score is calculated yet.</Text>
      </Card>
      <CameraStage compact onCapture={({ media }) => storeMedia(media)} onError={setError} />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void importOriginal()} tone="data" />
      {current ? (
        <Card eyebrow="Stored locally" title={`${current.width ?? '?'} × ${current.height ?? '?'}`} tone="clear">
          <Text style={styles.note}>{current.source.toUpperCase()} · {current.mimeType ?? 'UNKNOWN'} · image bytes are not stored in the draft.</Text>
        </Card>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSansBold', fontSize: 15, lineHeight: 21 },
  note: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 13, lineHeight: 19 },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
});

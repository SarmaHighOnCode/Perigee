import { formatBytes } from '@perigee/camera';
import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen } from '@perigee/ui';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useFieldStore } from '../../src/state/fieldStore';

export default function ReviewCaptureScreen() {
  const media = useFieldStore((state) => state.media);
  if (!media) return <Redirect href="/scan/capture" />;
  return (
    <Screen
      action={<Button label="USE THIS CAPTURE" onPress={() => router.push('/scan/fixture')} size="primary" />}
      eyebrow="STEP 2 · HUMAN REVIEW"
      title="Review photo"
    >
      <View style={styles.previewFrame}>
        <Image contentFit="contain" source={{ uri: media.uri }} style={styles.preview} />
      </View>
      <Card eyebrow={media.source.toUpperCase()} title="Original media">
        <Text style={styles.data}>{media.width ?? '?'} × {media.height ?? '?'} PX</Text>
        <Text style={styles.data}>{media.megapixels ?? '?'} MP · {formatBytes(media.bytes)}</Text>
        <Text style={styles.copy}>No crop, editing or quality reduction was requested by Perigee.</Text>
      </Card>
      <Card eyebrow="Deferred" title="Face quality unavailable" tone="warn">
        <Text style={styles.copy}>Pose, detection confidence and facial sharpness require the held face module. This app does not invent those values.</Text>
      </Card>
      <Button label="RETAKE / CHOOSE ANOTHER" onPress={() => router.replace('/scan/capture')} tone="neutral" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewFrame: { backgroundColor: palette.primary, borderColor: palette.primary, borderWidth: structure.borderWidth, height: 390, padding: 3 },
  preview: { flex: 1 },
  data: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 14 },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21, marginTop: space[1] },
});

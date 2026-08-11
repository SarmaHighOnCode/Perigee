import { CameraStage, formatBytes, normalizeMedia, type MediaRecord } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import {
  diagnoseRuntime,
  modelBaseUrl,
  type ModelProgress,
  type RuntimeDiagnostic,
} from '@perigee/face';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';

export default function DiagnosticsScreen() {
  const client = usePerigeeClient();
  const [backend, setBackend] = useState<string>('NOT TESTED');
  const [media, setMedia] = useState<MediaRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeDiagnostic | null>(null);
  const [runtimeProgress, setRuntimeProgress] = useState<Partial<Record<ModelProgress['key'], ModelProgress>>>({});
  const [runtimeRunning, setRuntimeRunning] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

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

  async function verifyFaceRuntime() {
    setRuntimeRunning(true);
    setRuntime(null);
    setRuntimeProgress({});
    setRuntimeError(null);
    try {
      const result = await diagnoseRuntime(modelBaseUrl(), (progress) => {
        setRuntimeProgress((current) => ({ ...current, [progress.key]: progress }));
      });
      setRuntime(result);
    } catch (caught) {
      setRuntimeError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRuntimeRunning(false);
    }
  }

  const runtimeReady = runtime
    ? runtime.onnxRuntimeLoaded && runtime.skiaLoaded
      && runtime.detectorReady && runtime.recogniserReady
    : false;

  return (
    <Screen eyebrow="On-device proof" title="Diagnostics">
      <SyntheticBanner compact />
      <Card eyebrow="API" title="Backend contract" trailing={<StatusChip label={backend} tone={backend === 'FAILED' ? 'alert' : backend === 'NOT TESTED' ? 'neutral' : 'clear'} />}>
        <Button label="RUN HEALTH / READY / CONFIG" onPress={() => void checkBackend()} tone="data" />
      </Card>
      <Card eyebrow="Native pipeline" title="Camera & gallery">
        <Text style={styles.copy}>This is the same maximum-quality VisionCamera stage used by both production apps and Camera Lab.</Text>
      </Card>
      <Card
        eyebrow="Native face pipeline"
        title={runtime ? runtimeReady ? 'Runtime verified' : 'Verification failed' : 'Not verified'}
        tone={runtime ? runtimeReady ? 'clear' : 'alert' : 'neutral'}
        trailing={<StatusChip label={runtime ? runtimeReady ? 'READY' : 'FAILED' : 'NOT TESTED'} tone={runtime ? runtimeReady ? 'clear' : 'alert' : 'neutral'} />}
      >
        <Button label="VERIFY FACE RUNTIME" loading={runtimeRunning} onPress={() => void verifyFaceRuntime()} tone="data" />
        {(Object.values(runtimeProgress) as ModelProgress[]).map((progress) => (
          <Text key={progress.key} style={styles.mono}>
            {progress.key} · {progress.phase} · {progress.receivedBytes} / {progress.totalBytes} bytes
          </Text>
        ))}
        {runtime ? (
          <View style={styles.runtimeDetails}>
            <Text style={styles.copy}>Model ID: {runtime.modelId}</Text>
            <Text style={styles.copy}>ONNX Runtime: {runtime.onnxRuntimeLoaded ? 'LOADED' : 'FAILED'}</Text>
            <Text style={styles.copy}>Skia: {runtime.skiaLoaded ? 'LOADED' : 'FAILED'}</Text>
            <Text style={styles.mono}>Detector inputs: {runtime.detectorInputs.join(', ') || 'NONE DISCOVERED'}</Text>
            <Text style={styles.mono}>Detector outputs: {runtime.detectorOutputs.join(', ') || 'NONE DISCOVERED'}</Text>
            <Text style={styles.mono}>Recogniser inputs: {runtime.recogniserInputs.join(', ') || 'NONE DISCOVERED'}</Text>
            <Text style={styles.mono}>Recogniser outputs: {runtime.recogniserOutputs.join(', ') || 'NONE DISCOVERED'}</Text>
            {runtime.failures.map((failure, index) => <Text accessibilityRole="alert" key={`${failure}-${index}`} style={styles.error}>{failure}</Text>)}
          </View>
        ) : null}
        {runtimeError ? <Text accessibilityRole="alert" style={styles.error}>{runtimeError}</Text> : null}
      </Card>
      <CameraStage compact onCapture={({ media: captured }) => setMedia(captured)} onError={setError} />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void importOriginal()} tone="data" />
      {media ? <Card eyebrow={media.source} title={`${media.width ?? '?'} × ${media.height ?? '?'}`} tone="clear"><Text style={styles.copy}>{formatBytes(media.bytes)} · {media.mimeType} · {media.megapixels ?? '?'} MP</Text></Card> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 11, lineHeight: 17 },
  runtimeDetails: { gap: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
});

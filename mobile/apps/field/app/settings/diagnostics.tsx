import { palette, space } from '@perigee/design-tokens';
import {
  diagnoseRuntime,
  modelBaseUrl,
  type ModelProgress,
  type RuntimeDiagnostic,
} from '@perigee/face';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';

interface DiagnosticState {
  health?: string;
  database?: string;
  storage?: string;
  dataset?: string;
  models?: number;
}

export default function DiagnosticsScreen() {
  const client = usePerigeeClient();
  const [state, setState] = useState<DiagnosticState>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeDiagnostic | null>(null);
  const [runtimeProgress, setRuntimeProgress] = useState<Partial<Record<ModelProgress['key'], ModelProgress>>>({});
  const [runtimeRunning, setRuntimeRunning] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  async function runChecks() {
    setRunning(true);
    setError(null);
    try {
      const [health, ready, config] = await Promise.all([client.health(), client.ready(), client.config()]);
      setState({
        health: health.status,
        database: ready.database,
        storage: ready.storage,
        dataset: config.dataset_mode,
        models: config.allowed_model_ids.length,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
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
    <Screen action={<Button label="RUN SYSTEM CHECKS" loading={running} onPress={() => void runChecks()} size="primary" />} eyebrow="READ-ONLY CHECKS" title="Diagnostics">
      <SyntheticBanner compact />
      <View style={styles.grid}>
        <Card eyebrow="Liveness" title={state.health ?? 'Not tested'} tone={state.health === 'ok' ? 'clear' : 'neutral'}><StatusChip tone={state.health === 'ok' ? 'clear' : 'neutral'} /></Card>
        <Card eyebrow="Database" title={state.database ?? 'Not tested'} tone={state.database === 'ok' ? 'clear' : 'neutral'}><StatusChip tone={state.database === 'ok' ? 'clear' : 'neutral'} /></Card>
        <Card eyebrow="Object storage" title={state.storage ?? 'Not tested'} tone={state.storage === 'ok' ? 'clear' : state.storage === 'disabled' ? 'warn' : 'neutral'}><StatusChip tone={state.storage === 'ok' ? 'clear' : 'warn'} /></Card>
        <Card eyebrow="Dataset" title={state.dataset ?? 'Not tested'} tone={state.dataset === 'synthetic' ? 'data' : 'neutral'}><Text style={styles.copy}>{state.models ?? 0} allowed model IDs</Text></Card>
      </View>
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
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[4] },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14 },
  mono: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 11, lineHeight: 17 },
  runtimeDetails: { gap: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

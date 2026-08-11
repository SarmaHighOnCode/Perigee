import { palette, space } from '@perigee/design-tokens';
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

  return (
    <Screen action={<Button label="RUN SYSTEM CHECKS" loading={running} onPress={() => void runChecks()} size="primary" />} eyebrow="READ-ONLY CHECKS" title="Diagnostics">
      <SyntheticBanner compact />
      <View style={styles.grid}>
        <Card eyebrow="Liveness" title={state.health ?? 'Not tested'} tone={state.health === 'ok' ? 'clear' : 'neutral'}><StatusChip tone={state.health === 'ok' ? 'clear' : 'neutral'} /></Card>
        <Card eyebrow="Database" title={state.database ?? 'Not tested'} tone={state.database === 'ok' ? 'clear' : 'neutral'}><StatusChip tone={state.database === 'ok' ? 'clear' : 'neutral'} /></Card>
        <Card eyebrow="Object storage" title={state.storage ?? 'Not tested'} tone={state.storage === 'ok' ? 'clear' : state.storage === 'disabled' ? 'warn' : 'neutral'}><StatusChip tone={state.storage === 'ok' ? 'clear' : 'warn'} /></Card>
        <Card eyebrow="Dataset" title={state.dataset ?? 'Not tested'} tone={state.dataset === 'synthetic' ? 'data' : 'neutral'}><Text style={styles.copy}>{state.models ?? 0} allowed model IDs</Text></Card>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[4] },
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14 },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
});

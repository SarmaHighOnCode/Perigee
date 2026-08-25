import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useModelPreload } from '../../src/services/modelPreload';
import { processProbe } from '../../src/services/processProbe';
import { useFieldStore } from '../../src/state/fieldStore';

type Phase = 'waiting' | 'working' | 'done' | 'failed';

export default function ProcessProbeScreen() {
  const media = useFieldStore((state) => state.media);
  const probe = useFieldStore((state) => state.probe);
  const setProbe = useFieldStore((state) => state.setProbe);
  const startModelPreload = useModelPreload((state) => state.start);
  const modelsReady = useModelPreload((state) => state.status === 'ready');
  const modelsFailed = useModelPreload((state) => state.status === 'failed');
  const modelError = useModelPreload((state) => state.error);
  const [phase, setPhase] = useState<Phase>(probe ? 'done' : 'waiting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { startModelPreload(); }, [startModelPreload]);

  useEffect(() => {
    if (!media || probe) return;
    if (!modelsReady) {
      setPhase('waiting');
      return;
    }
    let cancelled = false;
    setPhase('working');
    setError(null);
    processProbe(media.uri)
      .then((result) => {
        if (cancelled) return;
        setProbe(result);
        setPhase('done');
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setPhase('failed');
      });
    return () => { cancelled = true; };
  }, [media, probe, modelsReady, attempt, setProbe]);

  if (!media) return <Redirect href="/scan/capture" />;

  return (
    <Screen
      action={<Button disabled={phase !== 'done'} label="SEARCH" onPress={() => router.push('/scan/searching')} size="primary" />}
      eyebrow="STEP 3 · ON-DEVICE MATCH"
      title="Process capture"
    >
      <SyntheticBanner />
      {modelsFailed ? (
        <Card eyebrow="Model download failed" title="Cannot process capture" tone="alert">
          <Text style={styles.copy}>{modelError}</Text>
        </Card>
      ) : null}
      <Card
        eyebrow="On-device"
        title={phase === 'done' ? 'Embedding ready' : phase === 'failed' ? 'Processing failed' : 'Detecting face'}
        tone={phase === 'done' ? 'clear' : phase === 'failed' ? 'warn' : 'data'}
        trailing={phase === 'done' && probe ? <StatusChip label={`QUALITY ${probe.quality.score.toFixed(2)}`} tone="clear" /> : undefined}
      >
        {phase === 'waiting' ? <Text style={styles.copy}>Waiting for face models to finish downloading…</Text> : null}
        {phase === 'working' ? (
          <View style={styles.row}>
            <ActivityIndicator color={palette.signal} size="small" />
            <Text style={styles.copy}>Detecting face and generating embedding…</Text>
          </View>
        ) : null}
        {phase === 'done' ? <Text style={styles.copy}>This capture is ready to search. No match assertion is made on-device.</Text> : null}
        {phase === 'failed' ? (
          <>
            <Text style={styles.copy}>{error}</Text>
            <Button label="RETRY" onPress={() => setAttempt((value) => value + 1)} tone="warn" />
          </>
        ) : null}
      </Card>
      <Button label="RETAKE / CHOOSE ANOTHER" onPress={() => router.replace('/scan/capture')} tone="neutral" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { alignItems: 'center', flexDirection: 'row', gap: space[2] },
});

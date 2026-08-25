import { CameraStage, normalizeMedia } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { setCapture, type EnrollmentCapture, type RequiredCaptureAngle } from '../domain/draft';
import { activeDraft, useEnrollStore } from '../state/enrollStore';
import { getFaceEngine } from '../services/faceEngine';
import { embedCapture } from '../services/embedCapture';
import { shortError } from '../services/shortError';
import { useModelPreload } from '../services/modelPreload';
import { ModelPrepCard } from './ModelPrepCard';
import { WizardProgress } from './WizardProgress';

const labels: Record<RequiredCaptureAngle, { title: string; cue: string; step: string }> = {
  frontal: { title: 'Capture front', cue: 'Face camera directly. Keep eyes level and the full face inside the guide.', step: 'frontal' },
  left: { title: 'Capture left', cue: 'Turn the subject left approximately 45°. Keep both eyes visible.', step: 'left' },
  right: { title: 'Capture right', cue: 'Turn the subject right approximately 45°. Keep both eyes visible.', step: 'right' },
};

type EmbedPhase = 'idle' | 'waiting' | 'working' | 'done' | 'failed';

interface EmbedState {
  phase: EmbedPhase;
  qualityScore?: number;
  error?: string;
}

export function CaptureStep({ angle, nextHref }: { angle: RequiredCaptureAngle; nextHref: Href }) {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [error, setError] = useState<string | null>(null);
  const [embed, setEmbed] = useState<EmbedState>({ phase: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const label = labels[angle];
  const current = draft?.captures[angle];
  const modelsReady = useModelPreload((state) => state.status === 'ready');

  useEffect(() => {
    if (!current) {
      setEmbed({ phase: 'idle' });
      return;
    }
    if (current.embedding) {
      setEmbed({ phase: 'done', qualityScore: current.quality?.score ?? 0 });
      return;
    }
    if (!modelsReady) {
      setEmbed({ phase: 'waiting' });
      return;
    }
    let cancelled = false;
    setEmbed({ phase: 'working' });
    embedCapture(current.uri, getFaceEngine())
      .then((result) => {
        if (cancelled || !draft) return;
        const updated: EnrollmentCapture = {
          ...current,
          embedding: Array.from(result.embedding),
          modelId: result.modelId,
          quality: result.quality,
        };
        saveDraft(setCapture(draft, updated));
        setEmbed({ phase: 'done', qualityScore: result.quality.score });
      })
      .catch((caught) => {
        if (cancelled) return;
        console.error('Embedding failed', caught);
        setEmbed({
          phase: 'failed',
          error: shortError(caught),
        });
      });
    return () => { cancelled = true; };
  }, [current, current?.embedding, modelsReady, attempt, draft, saveDraft]);

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
      setError(shortError(caught));
    }
  }

  if (!draft) {
    return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  }

  const embedPending = embed.phase === 'working' || embed.phase === 'waiting';

  return (
    <Screen
      action={(
        <Button
          disabled={!current || embedPending}
          label="SAVE & CONTINUE"
          onPress={() => router.push(nextHref)}
          size="primary"
        />
      )}
      eyebrow="Enrollment capture"
      title={label.title}
    >
      <WizardProgress current={label.step} />
      <ModelPrepCard />
      <Card eyebrow="Pose guide" title={label.step} tone="data">
        <Text style={styles.copy}>{label.cue}</Text>
      </Card>
      <CameraStage
        compact
        onCapture={({ media }) => storeMedia(media)}
        onError={(message) => setError(shortError(message))}
      />
      <Button label="IMPORT ORIGINAL FROM GALLERY" onPress={() => void importOriginal()} tone="data" />
      {current ? (
        <Card
          eyebrow="Stored locally"
          title={`${current.width ?? '?'} × ${current.height ?? '?'}`}
          tone={embed.phase === 'done' ? 'clear' : embed.phase === 'failed' ? 'warn' : 'data'}
          trailing={embed.phase === 'done' ? <StatusChip label={`QUALITY ${embed.qualityScore?.toFixed(2) ?? '—'}`} tone="clear" /> : undefined}
        >
          <Text style={styles.note}>{current.source.toUpperCase()} · {current.mimeType ?? 'UNKNOWN'}</Text>
          {embed.phase === 'waiting' ? <Text style={styles.note}>Waiting for face models to finish downloading…</Text> : null}
          {embed.phase === 'working' ? (
            <View style={styles.embedRow}>
              <ActivityIndicator color={palette.signal} size="small" />
              <Text style={styles.note}>Detecting face and generating embedding…</Text>
            </View>
          ) : null}
          {embed.phase === 'done' ? <Text style={styles.note}>Face embedding ready — this capture is searchable after submission.</Text> : null}
          {embed.phase === 'failed' ? (
            <>
              <Text style={styles.note}>{embed.error}</Text>
              <Text style={styles.note}>Retake the photo for a searchable capture, or continue without an embedding for this angle.</Text>
              <Button label="RETRY EMBEDDING" onPress={() => setAttempt((value) => value + 1)} tone="warn" />
            </>
          ) : null}
        </Card>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSansBold', fontSize: 15, lineHeight: 21 },
  note: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 13, lineHeight: 19 },
  embedRow: { alignItems: 'center', flexDirection: 'row', gap: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

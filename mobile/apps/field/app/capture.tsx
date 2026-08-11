import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isPendingDecisionLimit, PerigeeApiError } from '@perigee/api-client';
import { PerigeeCamera, type CaptureResult } from '@perigee/camera';
import { palette, space } from '@perigee/design-tokens';
import { Banner, OfficerChip, QualityMeter } from '@perigee/ui';

import { getClient, getFaceEngine } from '../lib/perigee';
import { useSession } from '../lib/session';

type Stage = 'idle' | 'embedding' | 'searching';

export default function Capture() {
  const { shift } = useSession();
  const [stage, setStage] = useState<Stage>('idle');
  const [quality, setQuality] = useState<number | null>(null);
  const [coaching, setCoaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCapture = useCallback(
    async (capture: CaptureResult) => {
      if (!shift) return;
      setError(null);

      try {
        setStage('embedding');
        const engine = getFaceEngine();

        // The embedding happens HERE, on the device. The photograph never
        // leaves — only 512 floats do. That is a property of the network
        // topology, not of a policy document. docs/ADR/0001.
        // FaceInput carries frame data, not a URI. The fixture engine ignores
        // it; the real SCRFD + ArcFace engine will decode the frame here.
        const result = await engine.embed({
          ...(capture.width !== null ? { width: capture.width } : {}),
          ...(capture.height !== null ? { height: capture.height } : {}),
        });
        setQuality(result.quality.score);

        if (result.quality.score < 0.35) {
          setCoaching('LOW QUALITY — HOLD STEADY AND RETRY');
          setStage('idle');
          return;
        }

        setStage('searching');
        const client = getClient(shift.officerId);
        const search = await client.search({
          embedding: Array.from(result.embedding),
          model_id: result.modelId,
          quality: {
            score: result.quality.score,
            det_score: result.quality.detScore,
            blur: result.quality.blur,
            yaw: result.quality.yaw,
            pitch: result.quality.pitch,
            face_px: result.quality.facePx,
          },
          reason_code: shift.reasonCode,
          top_k: 5,
        });

        router.push(`/results/${search.search_id}`);
      } catch (caught) {
        if (caught instanceof PerigeeApiError && isPendingDecisionLimit(caught)) {
          // The human-in-the-loop brake. Route straight to the searches that
          // need adjudicating rather than showing a dead end.
          router.push('/pending');
          return;
        }
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setStage('idle');
      }
    },
    [shift],
  );

  if (!shift) {
    router.replace('/');
    return null;
  }

  const busy = stage !== 'idle';
  const busyLabel = stage === 'embedding' ? 'EMBEDDING…' : 'SEARCHING…';

  return (
    <View style={styles.page}>
      <OfficerChip
        officerId={shift.officerId}
        context={shift.reasonCode.toUpperCase().replace("_", " ")}
      />

      {error ? (
        <Banner tone="alert" dismissible={false}
          title={error}
        />
      ) : null}

      <PerigeeCamera
        busy={busy}
        busyLabel={busyLabel}
        captureLabel="CAPTURE"
        onCapture={(capture) => void onCapture(capture)}
        onError={setError}
        overlay={
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.reticle} />
            <Text style={styles.reticleHint}>
              {coaching ?? 'ALIGN FACE · TAP TO FOCUS'}
            </Text>
            {quality !== null ? <QualityMeter quality={quality} /> : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: space[2], padding: space[3] },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  reticle: {
    borderColor: palette.signal,
    borderWidth: 3,
    height: 260,
    width: 200,
  },
  reticleHint: {
    backgroundColor: palette.ink,
    color: palette.signal,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: space[2],
    paddingHorizontal: space[2],
    paddingVertical: 4,
  },
  errorText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
});

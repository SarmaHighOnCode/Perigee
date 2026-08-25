import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { WizardProgress } from '../../src/components/WizardProgress';
import { requiredCaptureAngles } from '../../src/domain/draft';
import { reviewReadiness } from '../../src/domain/validation';
import { submitEnrollment } from '../../src/services/submitEnrollment';
import { shortError } from '../../src/services/shortError';
import { prepareCaptureForUpload } from '../../src/services/uploadMedia';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

export default function ReviewScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const addActivity = useEnrollStore((state) => state.addActivity);
  const operatorId = useEnrollStore((state) => state.operatorId);
  const deviceKey = useEnrollStore((state) => state.deviceKey);
  const client = usePerigeeClient();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<'clear' | 'warn' | 'alert'>('warn');
  const [canForceRetry, setCanForceRetry] = useState(false);

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  const readiness = reviewReadiness(draft);
  const configured = Boolean(operatorId && deviceKey);
  const embeddedAngles = requiredCaptureAngles.filter((angle) => draft.captures[angle]?.embedding);

  async function submit(forceAfterUnknown = false) {
    if (!configured || !readiness.ready) return;
    setWorking(true);
    setMessage(null);
    if (!forceAfterUnknown) setCanForceRetry(false);
    try {
      const result = await submitEnrollment(draft!, {
        client,
        prepareCapture: prepareCaptureForUpload,
        persist: async (next) => saveDraft(next),
      }, { forceAfterUnknown });
      saveDraft(result.draft);
      // Without the underlying failure the operator only sees "outcome is
      // unknown", which is the same text for a timeout, a rejected payload and
      // a dead network - and nothing to act on.
      const cause = result.draft.submission.person.error;
      const summary = result.message ?? (result.status === 'complete' ? 'Person, media, embedding and annotations all committed.' : result.status);
      setMessage(cause && result.status !== 'complete' ? `${summary} — ${cause}` : summary);
      setStatus(result.status === 'complete' ? 'clear' : result.status === 'partial' ? 'warn' : 'alert');
      setCanForceRetry(Boolean(result.canForceRetry));
      addActivity({
        id: `activity-${Date.now()}`, title: `Enrollment ${result.status}`,
        detail: result.message ?? result.draft.submission.person.personId ?? result.draft.draftId,
        tone: result.status === 'complete' ? 'clear' : result.status === 'partial' ? 'warn' : 'alert',
        createdAt: new Date().toISOString(),
      });
      if (result.status === 'complete' || result.status === 'partial') router.replace('/enroll/receipt');
    } catch (caught) {
      setMessage(shortError(caught));
      setStatus('alert');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Screen action={(
      <Button
        disabled={!readiness.ready || !configured || working}
        label={canForceRetry ? 'RETRY SUBMISSION' : 'CREATE PERSON & UPLOAD 3 PHOTOS'}
        loading={working}
        onPress={() => void submit(canForceRetry)}
        size="primary"
      />
    )} eyebrow="Explicit commit" title="Review">
      <WizardProgress current="review" />
      <SyntheticBanner compact />
      <Card eyebrow="Identity" title={draft.identity.full_name} trailing={<StatusChip label={readiness.issues.length === 0 ? 'VALID' : 'CHECK'} tone={readiness.issues.length === 0 ? 'clear' : 'alert'} />}>
        <Text style={styles.copy}>{draft.identity.aliases?.join(', ') || 'No aliases'} · {draft.identity.district || 'No district'}</Text>
      </Card>
      <Card eyebrow="Required media" title="Three angles">
        {requiredCaptureAngles.map((angle) => {
          const capture = draft.captures[angle];
          const upload = draft.submission.media[angle];
          return <Text key={angle} style={styles.row}>{angle.toUpperCase()} · {capture ? `${capture.width}×${capture.height}` : 'MISSING'} · {upload?.status.toUpperCase() ?? 'LOCAL'}</Text>;
        })}
        <Text style={styles.copy}>Metadata is removed losslessly before upload; JPEG compressed scan data is not re-encoded.</Text>
      </Card>
      <Card
        eyebrow="Face recognition"
        title={embeddedAngles.length > 0 ? `${embeddedAngles.length}/3 embeddings ready` : 'No embedding yet'}
        tone={embeddedAngles.length > 0 ? 'clear' : 'warn'}
      >
        {requiredCaptureAngles.map((angle) => {
          const capture = draft.captures[angle];
          const score = capture?.quality?.score;
          return (
            <Text key={angle} style={styles.row}>
              {angle.toUpperCase()} · {capture?.embedding ? `EMBEDDING READY · QUALITY ${score?.toFixed(2)}` : 'NO EMBEDDING'}
            </Text>
          );
        })}
        <Text style={styles.copy}>
          {embeddedAngles.length > 0
            ? 'Embeddings are submitted with the enrollment so this person is searchable.'
            : 'Retake at least the frontal capture so this person can be matched in searches.'}
        </Text>
      </Card>
      {(draft.cases.length > 0 || draft.relationships.length > 0) ? (
        <Card eyebrow="Submitted with enrollment" title="Record context" tone="clear">
          <Text style={styles.copy}>{draft.cases.length} case links · {draft.relationships.length} relationships will be written to the server.</Text>
        </Card>
      ) : null}
      {!configured ? <Card title="Connection required" tone="alert"><Text style={styles.copy}>Set an operator ID and device key before submission.</Text><Button label="OPEN CONNECTION" onPress={() => router.push('/settings/connection')} tone="alert" /></Card> : null}
      {readiness.issues.map((issue) => <Text accessibilityRole="alert" key={issue} style={styles.error}>{issue}</Text>)}
      {message ? <Text accessibilityRole="alert" style={[styles.message, status === 'clear' ? styles.clear : status === 'alert' ? styles.alert : styles.warn]}>{message}</Text> : null}
      {canForceRetry ? (
        <Card eyebrow="Recovery" title="Retry anyway?" tone="warn">
          <Text style={styles.copy}>The first attempt may or may not have created this person. Retrying can create a duplicate record, but unblocks the demo enrollment.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { borderBottomColor: palette.primary, borderBottomWidth: 2, color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 12, paddingVertical: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
  message: { borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
  clear: { backgroundColor: palette.clear }, warn: { backgroundColor: palette.warn }, alert: { backgroundColor: palette.alert },
});

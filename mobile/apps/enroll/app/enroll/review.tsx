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

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  const readiness = reviewReadiness(draft);
  const configured = Boolean(operatorId && deviceKey);

  async function submit() {
    if (!configured || !readiness.ready) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await submitEnrollment(draft!, {
        client,
        prepareCapture: prepareCaptureForUpload,
        persist: async (next) => saveDraft(next),
      });
      saveDraft(result.draft);
      setMessage(result.message ?? (result.status === 'complete' ? 'Person and all three media files committed.' : result.status));
      setStatus(result.status === 'complete' ? 'clear' : result.status === 'partial' ? 'warn' : 'alert');
      addActivity({
        id: `activity-${Date.now()}`, title: `Enrollment ${result.status}`,
        detail: result.message ?? result.draft.submission.person.personId ?? result.draft.draftId,
        tone: result.status === 'complete' ? 'clear' : result.status === 'partial' ? 'warn' : 'alert',
        createdAt: new Date().toISOString(),
      });
      if (result.status === 'complete' || result.status === 'partial') router.replace('/enroll/receipt');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
      setStatus('alert');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Screen action={<Button disabled={!readiness.ready || !configured} label="CREATE PERSON & UPLOAD 3 PHOTOS" loading={working} onPress={() => void submit()} size="primary" />} eyebrow="Explicit commit" title="Review">
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
      <Card eyebrow="Deferred biometric module" title="No embedding created" tone="data">
        <StatusChip label="FACE RECOGNITION ON HOLD" tone="data" />
        <Text style={styles.copy}>The current submission creates the person and commits media only. It never fabricates an embedding or quality score.</Text>
      </Card>
      {(draft.cases.length > 0 || draft.relationships.length > 0) ? (
        <Card eyebrow="Unsupported by current PR" title="Annotations remain local" tone="warn">
          <Text style={styles.copy}>{draft.cases.length} case links · {draft.relationships.length} relationships. The receipt will remain partial until backend write endpoints exist.</Text>
        </Card>
      ) : null}
      {!configured ? <Card title="Connection required" tone="alert"><Text style={styles.copy}>Set an operator ID and device key before submission.</Text><Button label="OPEN CONNECTION" onPress={() => router.push('/settings/connection')} tone="alert" /></Card> : null}
      {readiness.issues.map((issue) => <Text accessibilityRole="alert" key={issue} style={styles.error}>{issue}</Text>)}
      {message ? <Text accessibilityRole="alert" style={[styles.message, status === 'clear' ? styles.clear : status === 'alert' ? styles.alert : styles.warn]}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { borderBottomColor: palette.ink, borderBottomWidth: 2, color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 12, paddingVertical: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
  message: { borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
  clear: { backgroundColor: palette.clear }, warn: { backgroundColor: palette.warn }, alert: { backgroundColor: palette.alert },
});

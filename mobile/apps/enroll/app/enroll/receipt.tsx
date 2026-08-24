import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { requiredCaptureAngles } from '../../src/domain/draft';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

export default function ReceiptScreen() {
  const draft = useEnrollStore(activeDraft);
  if (!draft) return <Screen title="Receipt unavailable"><Button label="OPEN DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  const committed = requiredCaptureAngles.filter((angle) => draft.submission.media[angle]?.status === 'committed');
  const embedded = requiredCaptureAngles.filter((angle) => draft.captures[angle]?.embedding);
  const outcome = draft.submission.outcome;
  const failures = outcome
    ? outcome.embeddingErrors.length + outcome.caseErrors.length + outcome.relationshipErrors.length
    : 0;
  return (
    <Screen action={<Button label="RETURN TO RECORDS" onPress={() => router.replace('/(tabs)/roster')} size="primary" />} eyebrow="Enrollment receipt" title={failures > 0 ? 'Committed with issues' : 'Committed'}>
      <SyntheticBanner compact />
      <Card eyebrow="Person created" title={draft.identity.full_name} tone="clear" trailing={<StatusChip label="SERVER ID" tone="clear" />}>
        <Text selectable style={styles.id}>{draft.submission.person.personId ?? 'NOT CREATED'}</Text>
        <Text style={styles.copy}>Operator attribution: {useEnrollStore.getState().operatorId}</Text>
      </Card>
      <Card eyebrow="Object storage" title={`${committed.length}/3 media committed`} tone={committed.length === 3 ? 'clear' : 'alert'}>
        {requiredCaptureAngles.map((angle) => <Text key={angle} style={styles.row}>{angle.toUpperCase()} · {draft.submission.media[angle]?.status.toUpperCase() ?? 'PENDING'}</Text>)}
      </Card>
      <Card
        eyebrow="Face pipeline"
        title={embedded.length > 0 ? `${embedded.length} embedding(s) submitted` : 'No embedding submitted'}
        tone={embedded.length > 0 ? 'clear' : 'warn'}
      >
        {requiredCaptureAngles.map((angle) => {
          const capture = draft.captures[angle];
          return (
            <Text key={angle} style={styles.row}>
              {angle.toUpperCase()} · {capture?.embedding ? `READY · QUALITY ${capture.quality?.score.toFixed(2)}` : 'NONE'}
            </Text>
          );
        })}
        <Text style={styles.copy}>{embedded.length > 0 ? 'This person is searchable in Field screenings.' : 'This person cannot be matched until an embedding exists.'}</Text>
      </Card>
      {outcome ? (
        <Card
          eyebrow="Record context"
          title={`${outcome.casesLinked} case links · ${outcome.relationshipsCreated} relationships`}
          tone={failures > 0 ? 'warn' : 'clear'}
        >
          {[...outcome.caseErrors, ...outcome.relationshipErrors, ...outcome.embeddingErrors].map((item) => (
            <Text key={item} style={styles.copy}>{item}</Text>
          ))}
          {failures === 0 ? <Text style={styles.copy}>All annotations were written to the server.</Text> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 13 },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { borderBottomColor: palette.primary, borderBottomWidth: 2, color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 12, paddingVertical: 9 },
});

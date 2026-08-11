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
  const partial = draft.cases.length > 0 || draft.relationships.length > 0;
  return (
    <Screen action={<Button label="RETURN TO RECORDS" onPress={() => router.replace('/(tabs)/roster')} size="primary" />} eyebrow="Enrollment receipt" title={partial ? 'Partially committed' : 'Committed'}>
      <SyntheticBanner compact />
      <Card eyebrow="Person created" title={draft.identity.full_name} tone="clear" trailing={<StatusChip label="SERVER ID" tone="clear" />}>
        <Text selectable style={styles.id}>{draft.submission.person.personId ?? 'NOT CREATED'}</Text>
        <Text style={styles.copy}>Operator attribution: {useEnrollStore.getState().operatorId}</Text>
      </Card>
      <Card eyebrow="Object storage" title={`${committed.length}/3 media committed`} tone={committed.length === 3 ? 'clear' : 'alert'}>
        {requiredCaptureAngles.map((angle) => <Text key={angle} style={styles.row}>{angle.toUpperCase()} · {draft.submission.media[angle]?.status.toUpperCase() ?? 'PENDING'}</Text>)}
      </Card>
      <Card eyebrow="Face pipeline" title="Embedding deferred" tone="data"><Text style={styles.copy}>Images are available for the future on-device recognition module. No embedding was submitted by this app.</Text></Card>
      {partial ? <Card eyebrow="Backend contract gap" title="Local annotations pending" tone="warn"><Text style={styles.copy}>{draft.cases.length} case links and {draft.relationships.length} relationships remain only in this versioned local draft.</Text></Card> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 13 },
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { borderBottomColor: palette.ink, borderBottomWidth: 2, color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 12, paddingVertical: 9 },
});

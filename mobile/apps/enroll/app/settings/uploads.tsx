import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { requiredCaptureAngles } from '../../src/domain/draft';
import { selectDraftMap } from '../../src/state/draftSelectors';
import { useEnrollStore } from '../../src/state/enrollStore';

export default function UploadsScreen() {
  const draftMap = useEnrollStore(selectDraftMap);
  const drafts = Object.values(draftMap);
  const pending = drafts.filter((draft) => requiredCaptureAngles.some((angle) => draft.submission.media[angle]?.status !== 'committed'));
  return (
    <Screen eyebrow="Resumable checkpoints" title="Upload queue">
      {pending.length === 0 ? <Card title="Queue is clear" tone="clear"><Text style={styles.copy}>No locally tracked uploads are pending.</Text></Card> : pending.map((draft) => (
        <Card key={draft.draftId} eyebrow={draft.draftId} title={draft.identity.full_name || 'Unnamed draft'} trailing={<StatusChip label={draft.submission.person.status.toUpperCase()} tone="warn" />}>
          {requiredCaptureAngles.map((angle) => <Text key={angle} style={styles.row}>{angle.toUpperCase()} · {draft.submission.media[angle]?.status.toUpperCase() ?? 'LOCAL'}</Text>)}
          <Button label="REVIEW / RETRY" onPress={() => { useEnrollStore.getState().setActiveDraft(draft.draftId); router.push('/enroll/review'); }} tone="data" />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  row: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 12, paddingVertical: 5 },
});

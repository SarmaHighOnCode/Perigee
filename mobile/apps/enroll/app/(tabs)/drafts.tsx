import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { requiredAnglesComplete } from '../../src/domain/validation';
import { selectDraftMap } from '../../src/state/draftSelectors';
import { useEnrollStore } from '../../src/state/enrollStore';

export default function DraftsScreen() {
  const draftMap = useEnrollStore(selectDraftMap);
  const drafts = Object.values(draftMap);
  const startDraft = useEnrollStore((state) => state.startDraft);
  const setActiveDraft = useEnrollStore((state) => state.setActiveDraft);

  function begin() {
    startDraft();
    router.push('/enroll/identity');
  }

  return (
    <Screen action={<Button label="START NEW DRAFT" onPress={begin} size="primary" />} eyebrow="Offline-resilient" title="Drafts">
      {drafts.length === 0 ? (
        <Card eyebrow="Nothing pending" title="Desk is clear" tone="clear">
          <Text style={styles.copy}>Create a draft to begin identity and three-angle capture.</Text>
        </Card>
      ) : drafts.map((draft) => {
        const capturesDone = requiredAnglesComplete(draft.captures);
        return (
          <Card key={draft.draftId} eyebrow={draft.draftId} title={draft.identity.full_name || 'Unnamed draft'} trailing={<StatusChip label={draft.submission.person.status.toUpperCase()} tone={draft.submission.person.status === 'created' ? 'clear' : 'warn'} />}>
            <Text style={styles.copy}>{capturesDone ? '3/3 required captures' : `${Object.keys(draft.captures).length}/3 required captures`} · updated {new Date(draft.updatedAt).toLocaleString()}</Text>
            <Button label="CONTINUE DRAFT" onPress={() => { setActiveDraft(draft.draftId); router.push('/enroll/identity'); }} tone="data" />
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({ copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 } });

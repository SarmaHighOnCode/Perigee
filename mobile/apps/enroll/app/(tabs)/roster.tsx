import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { selectDraftMap } from '../../src/state/draftSelectors';
import { useEnrollStore } from '../../src/state/enrollStore';

export default function RosterScreen() {
  const draftMap = useEnrollStore(selectDraftMap);
  const drafts = Object.values(draftMap);
  const startDraft = useEnrollStore((state) => state.startDraft);
  const [recordId, setRecordId] = useState('');
  const created = drafts.filter((draft) => draft.submission.person.personId);

  function begin() {
    startDraft();
    router.push('/enroll/identity');
  }

  return (
    <Screen action={<Button label="NEW ENROLLMENT" onPress={begin} size="primary" />} eyebrow="Records desk" title="Enrollment">
      <SyntheticBanner compact />
      <Card eyebrow="This handset" title={`${created.length} created records`} tone="data">
        <Text style={styles.copy}>The backend provides record access by ID with purpose binding; it does not provide a roster or a name-search endpoint.</Text>
      </Card>
      <Card eyebrow="Explicit reference" title="Open record ID">
        <FormField autoCapitalize="none" autoCorrect={false} label="PERSON ID" onChangeText={setRecordId} placeholder="UUID from receipt" value={recordId} />
        <Button disabled={!recordId.trim()} label="OPEN LOCAL REFERENCE" onPress={() => router.push(`/person/${encodeURIComponent(recordId.trim())}`)} tone="data" />
      </Card>
      {created.map((draft) => (
        <Card key={draft.draftId} eyebrow="Created by this device" title={draft.identity.full_name} trailing={<StatusChip label={draft.submission.person.status.toUpperCase()} tone="clear" />}>
          <Text style={styles.id}>{draft.submission.person.personId}</Text>
          <Button label="OPEN RECEIPT" onPress={() => {
            useEnrollStore.getState().setActiveDraft(draft.draftId);
            router.push('/enroll/receipt');
          }} tone="neutral" />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  id: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 12 },
});

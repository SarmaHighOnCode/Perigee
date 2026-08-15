import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { useEnrollStore } from '../../src/state/enrollStore';

export default function PersonReferenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decodedId = decodeURIComponent(id ?? '');
  const draft = useEnrollStore((state) => Object.values(state.drafts).find((item) => item.submission.person.personId === decodedId));
  return (
    <Screen eyebrow="Purpose-safe reference" title={draft?.identity.full_name ?? 'Record ID'}>
      <Card eyebrow="Person ID" title={draft ? 'Created on this device' : 'External reference'} trailing={<StatusChip label={draft ? 'LOCAL RECEIPT' : 'NOT FETCHED'} tone={draft ? 'clear' : 'warn'} />}>
        <Text selectable style={styles.id}>{decodedId}</Text>
      </Card>
      {draft ? (
        <>
          <Card eyebrow="Local draft metadata" title="Enrollment status">
            <Text style={styles.copy}>Person: {draft.submission.person.status} · media committed: {Object.values(draft.submission.media).filter((item) => item?.status === 'committed').length}/3</Text>
          </Card>
          <Button label="OPEN RECEIPT" onPress={() => { useEnrollStore.getState().setActiveDraft(draft.draftId); router.push('/enroll/receipt'); }} tone="data" />
        </>
      ) : (
        <Card eyebrow="Backend privacy contract" title="No unbound PII lookup" tone="data">
          <Text style={styles.copy}>The person endpoint requires a purpose-authorized search ID. Perigee Enroll does not bypass that rule or fetch PII from a bare record ID.</Text>
        </Card>
      )}
      <Button label="BACK TO RECORDS" onPress={() => router.replace('/(tabs)/roster')} tone="neutral" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 13 },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
});

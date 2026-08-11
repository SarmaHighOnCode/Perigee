import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { WizardProgress } from '../../src/components/WizardProgress';
import { addRelationship } from '../../src/domain/draft';
import { canSubmitRelationship } from '../../src/domain/validation';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

export default function RelationshipsScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [target, setTarget] = useState('');
  const [relationshipType, setRelationshipType] = useState('associate');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!draft) return;
    const relationship = {
      targetPersonId: target.trim(), relationshipType: relationshipType.trim(),
      evidenceCaseIds: evidence.split(',').map((item) => item.trim()).filter(Boolean),
    };
    if (!canSubmitRelationship(relationship)) return setError('Target, relationship type and at least one evidence case are required');
    saveDraft(addRelationship(draft, relationship));
    setTarget('');
    setEvidence('');
    setError(null);
  }

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  return (
    <Screen action={<Button label="REVIEW ENROLLMENT" onPress={() => router.push('/enroll/review')} size="primary" />} eyebrow="Evidence-first graph" title="Relationships">
      <WizardProgress current="relationships" />
      <Card eyebrow="No unsupported graph writes" title="Staged locally" tone="warn">
        <StatusChip label="WRITE ENDPOINT PENDING" tone="warn" />
        <Text style={styles.copy}>Every relationship requires evidence case IDs. The current backend PR has no relationship create endpoint, so staged entries remain pending.</Text>
      </Card>
      <Card eyebrow="Evidence required" title="Add relationship">
        <FormField autoCapitalize="none" label="TARGET PERSON ID" onChangeText={setTarget} value={target} />
        <FormField label="RELATIONSHIP TYPE" onChangeText={setRelationshipType} value={relationshipType} />
        <FormField hint="Comma-separated existing case UUIDs." label="EVIDENCE CASE IDS" onChangeText={setEvidence} value={evidence} />
        <Button label="ADD LOCAL RELATIONSHIP" onPress={add} tone="data" />
      </Card>
      {draft.relationships.map((item) => (
        <Card key={`${item.targetPersonId}-${item.relationshipType}`} eyebrow={item.targetPersonId} title={item.relationshipType} trailing={<StatusChip label={`${item.evidenceCaseIds.length} EVIDENCE`} tone="data" />}>
          <Text style={styles.copy}>{item.evidenceCaseIds.join(', ')}</Text>
        </Card>
      ))}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
});

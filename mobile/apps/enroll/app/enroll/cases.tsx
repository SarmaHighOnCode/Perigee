import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { WizardProgress } from '../../src/components/WizardProgress';
import { addCaseLink, type CaseRole } from '../../src/domain/draft';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

const roles: CaseRole[] = ['accused', 'convicted', 'suspect', 'victim', 'witness', 'complainant'];

export default function CasesScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [caseId, setCaseId] = useState('');
  const [firNumber, setFirNumber] = useState('');
  const [role, setRole] = useState<CaseRole>('suspect');
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!draft) return;
    if (!caseId.trim()) return setError('A case ID is required');
    const normalizedFir = firNumber.trim();
    saveDraft(addCaseLink(draft, {
      caseId: caseId.trim(),
      role,
      ...(normalizedFir ? { firNumber: normalizedFir } : {}),
    }));
    setCaseId('');
    setFirNumber('');
    setError(null);
  }

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  return (
    <Screen action={<Button label="CONTINUE" onPress={() => router.push('/enroll/relationships')} size="primary" />} eyebrow="Optional record context" title="Cases">
      <WizardProgress current="cases" />
      <Card eyebrow="Current backend boundary" title="Staged locally" tone="warn">
        <StatusChip label="WRITE ENDPOINT PENDING" tone="warn" />
        <Text style={styles.copy}>The backend PR returns case records but does not expose a case-link write endpoint. Entries here remain visibly pending and are never represented as server-saved.</Text>
      </Card>
      <Card eyebrow="One role per case" title="Add case reference">
        <FormField autoCapitalize="none" label="CASE ID" onChangeText={setCaseId} placeholder="Existing case UUID" value={caseId} />
        <FormField label="FIR NUMBER (DISPLAY ONLY)" onChangeText={setFirNumber} value={firNumber} />
        <Text style={styles.label}>PERSON ROLE IN THIS CASE</Text>
        <View style={styles.grid}>{roles.map((item) => <Button key={item} label={item.toUpperCase()} onPress={() => setRole(item)} tone={role === item ? 'signal' : 'neutral'} />)}</View>
        <Button label="ADD LOCAL CASE" onPress={add} tone="data" />
      </Card>
      {draft.cases.map((item) => (
        <Card key={item.caseId} eyebrow={item.caseId} title={item.firNumber || 'Case reference'} trailing={<StatusChip label={item.role.toUpperCase()} tone="data" />}>
          <Text style={styles.copy}>Local annotation · not yet submitted</Text>
        </Card>
      ))}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  label: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 11, letterSpacing: 1 },
  grid: { gap: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

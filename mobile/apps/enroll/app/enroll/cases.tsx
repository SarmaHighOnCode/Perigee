import type { CaseSummary } from '@perigee/api-client';
import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { ChoiceGrid } from '../../src/components/ChoiceGrid';
import { FormField } from '../../src/components/FormField';
import { WizardProgress } from '../../src/components/WizardProgress';
import { addCaseLink, removeCaseLink, type CaseRole } from '../../src/domain/draft';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

const roles: CaseRole[] = ['accused', 'convicted', 'suspect', 'victim', 'witness', 'complainant'];

export default function CasesScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const client = usePerigeeClient();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<CaseRole>('suspect');
  const [results, setResults] = useState<CaseSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = new Set(draft?.cases.map((item) => item.caseId) ?? []);

  async function search() {
    const q = query.trim();
    if (!q) return setError('Enter an FIR number, station or district to search');
    setSearching(true);
    setError(null);
    try {
      const response = await client.listCases({ q, limit: 10 });
      setResults(response.cases);
      setSearched(true);
    } catch (caught) {
      setResults([]);
      setSearched(true);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSearching(false);
    }
  }

  function link(summary: CaseSummary) {
    if (!draft) return;
    saveDraft(addCaseLink(draft, {
      caseId: summary.case_id,
      role,
      firNumber: summary.fir_number,
    }));
  }

  function unlink(caseId: string) {
    if (!draft) return;
    saveDraft(removeCaseLink(draft, caseId));
  }

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  return (
    <Screen action={<Button label="CONTINUE" onPress={() => router.push('/enroll/relationships')} size="primary" />} eyebrow="Optional record context" title="Cases">
      <WizardProgress current="cases" />
      <Card eyebrow="Step 1 · pick the person's role" title="Role in this case">
        <ChoiceGrid onSelect={(value) => setRole(value as CaseRole)} options={roles} selected={role} />
        <Text style={styles.copy}>Applies to the next case you link below.</Text>
      </Card>
      <Card eyebrow="Step 2 · find the case on the server" title="Search cases">
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <FormField
              autoCapitalize="none"
              label="SEARCH"
              onChangeText={setQuery}
              onSubmitEditing={() => void search()}
              placeholder="FIR number, station or district"
              returnKeyType="search"
              value={query}
            />
          </View>
          <Button label={searching ? 'SEARCHING' : 'SEARCH'} loading={searching} onPress={() => void search()} tone="primary" />
        </View>
        {searched && !searching && results.length === 0 && !error ? (
          <Text style={styles.copy}>No cases matched. Try a shorter query.</Text>
        ) : null}
        {results.map((item) => {
          const linked = linkedIds.has(item.case_id);
          return (
            <View key={item.case_id} style={styles.result}>
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle}>{item.fir_number}</Text>
                <Text style={styles.copy}>{item.station} · {item.district} · {item.status.toUpperCase()}</Text>
              </View>
              {linked
                ? <StatusChip label="LINKED" tone="clear" />
                : <Button label={`LINK AS ${role.toUpperCase()}`} onPress={() => link(item)} tone="signal" />}
            </View>
          );
        })}
      </Card>
      {draft.cases.length > 0 ? (
        <Card eyebrow={`${draft.cases.length} linked · submitted with enrollment`} title="Linked cases" tone="clear">
          {draft.cases.map((item) => (
            <View key={item.caseId} style={styles.result}>
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle}>{item.firNumber || item.caseId}</Text>
                <Text style={styles.copy}>{item.role.toUpperCase()}</Text>
              </View>
              <Button label="REMOVE" onPress={() => unlink(item.caseId)} tone="alert" />
            </View>
          ))}
        </Card>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  searchRow: { alignItems: 'flex-end', gap: space[2], flexDirection: 'row' },
  searchField: { flex: 1 },
  result: {
    alignItems: 'center',
    borderBottomColor: palette.primary,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space[2],
    justifyContent: 'space-between',
    paddingVertical: space[2],
  },
  resultBody: { flex: 1 },
  resultTitle: { color: palette.primary, fontFamily: 'PublicSansBold', fontSize: 15 },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

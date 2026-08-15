import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';

export default function PersonScreen() {
  const { id, searchId } = useLocalSearchParams<{ id: string; searchId: string }>();
  const client = usePerigeeClient();
  const query = useQuery({ queryKey: ['person', id, searchId], queryFn: () => client.person(id, searchId) });
  return (
    <Screen eyebrow="PURPOSE-BOUND RECORD" title="Confirmed record">
      <SyntheticBanner compact />
      {query.isLoading ? <StatusChip label="LOADING AUTHORISED RECORD" tone="data" /> : null}
      {query.error ? (
        <Card eyebrow="Access denied or unavailable" title="Record not opened" tone="alert">
          <Text style={styles.copy}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
        </Card>
      ) : null}
      {query.data ? (
        <>
          <Card eyebrow={query.data.person_id} title={query.data.full_name} tone="signal">
            <Text style={styles.mono}>{query.data.aliases.length ? `ALIASES · ${query.data.aliases.join(', ')}` : 'NO ALIASES RECORDED'}</Text>
            <Text style={styles.copy}>{query.data.gender ?? 'GENDER UNKNOWN'} · {query.data.dob ?? 'DOB UNKNOWN'} · {query.data.district ?? 'DISTRICT UNKNOWN'}</Text>
          </Card>
          <View style={styles.summaryRow}>
            <StatusChip label={`${query.data.cases.length} CASES`} tone="data" />
            <StatusChip label={`${query.data.graph_summary.degree} LINKS`} tone="signal" />
          </View>
          {query.data.cases.map((caseRef) => (
            <Card
              eyebrow={`${caseRef.role.toUpperCase()} · ${caseRef.status.toUpperCase()}`}
              key={caseRef.case_id}
              title={caseRef.fir_number}
              tone={caseRef.role === 'convicted' ? 'alert' : 'warn'}
            >
              <Text style={styles.copy}>{caseRef.station} · {caseRef.district}</Text>
              <Text style={styles.copy}>{caseRef.offence?.title ?? 'OFFENCE NOT LINKED'}</Text>
              <Text style={styles.mono}>IPC {caseRef.offence?.ipc_section ?? '—'} · BNS {caseRef.offence?.bns_section ?? '—'}</Text>
            </Card>
          ))}
          <Button label="OPEN RELATIONSHIP GRAPH" onPress={() => router.push({ pathname: '/graph/[id]', params: { id } })} tone="data" />
          <Button label="NEW SCREENING" onPress={() => router.replace('/scan/capture')} tone="signal" />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 11, lineHeight: 17 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});

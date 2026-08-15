import { palette, space } from '@perigee/design-tokens';
import { Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';

export default function GraphScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = usePerigeeClient();
  const query = useQuery({ queryKey: ['graph', id], queryFn: () => client.graph(id, { depth: 2, limit: 100 }) });
  return (
    <Screen eyebrow="EVIDENCE-BACKED LINKS" title="Relationship graph">
      <SyntheticBanner compact />
      {query.isLoading ? <StatusChip label="EXPANDING TWO HOPS" tone="data" /> : null}
      {query.error ? (
        <Card eyebrow="Graph unavailable" title="Could not expand" tone="alert">
          <Text style={styles.copy}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
        </Card>
      ) : null}
      {query.data ? (
        <>
          <View style={styles.stats}>
            <StatusChip label={`${query.data.nodes.length} NODES`} tone="data" />
            <StatusChip label={`${query.data.edges.length} EDGES`} tone="signal" />
            {query.data.truncated ? <StatusChip label="TRUNCATED" tone="warn" /> : null}
          </View>
          <Card eyebrow="Orbit preview" title="Network data loaded" tone="data">
            <Text style={styles.orbit}>◎—●—◎{query.data.edges.length > 2 ? '—●—◎' : ''}</Text>
            <Text style={styles.copy}>Interactive Skia orbit rendering is a later visualization layer. The current screen verifies the protected graph contract without hiding evidence state.</Text>
          </Card>
          <Card eyebrow="Root person" title={query.data.root}>
            <Text style={styles.mono}>Depth 2 · maximum 100 nodes</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  orbit: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 32, textAlign: 'center' },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 11 },
});

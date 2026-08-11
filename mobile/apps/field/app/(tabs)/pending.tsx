import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { useFieldStore } from '../../src/state/fieldStore';

export default function PendingScreen() {
  const client = usePerigeeClient();
  const deviceKey = useFieldStore((state) => state.deviceKey);
  const query = useQuery({
    queryKey: ['pending-searches'],
    queryFn: () => client.pending(),
    enabled: deviceKey.length > 0,
  });

  return (
    <Screen eyebrow="HUMAN-IN-THE-LOOP BRAKE" title="Pending">
      {!deviceKey ? (
        <Card eyebrow="Connection required" title="Device key missing" tone="warn">
          <Text style={styles.copy}>Configure the development device key before loading server work.</Text>
          <Button label="OPEN CONNECTION" onPress={() => router.push('/settings/connection')} tone="signal" />
        </Card>
      ) : null}
      {query.isLoading ? <StatusChip label="LOADING SERVER WORK" tone="data" /> : null}
      {query.error ? (
        <Card eyebrow="Could not load" title="Pending unavailable" tone="alert">
          <Text style={styles.copy}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
          <Button label="RETRY" onPress={() => void query.refetch()} tone="warn" />
        </Card>
      ) : null}
      {query.data?.pending.length === 0 ? (
        <Card eyebrow="Queue clear" title="No open decisions" tone="clear">
          <Text style={styles.copy}>Every search attributed to this device has a recorded outcome.</Text>
        </Card>
      ) : null}
      {query.data?.pending.map((pending) => (
        <Card
          eyebrow={`${pending.reason_code} · ${pending.age_seconds}s old`}
          key={pending.search_id}
          title={`${pending.candidate_count} candidates`}
          tone="warn"
        >
          <Text style={styles.mono}>{pending.search_id}</Text>
          <Text style={styles.copy}>Top score: {pending.top_score?.toFixed(4) ?? 'NO CANDIDATES'}</Text>
          <Button
            label="RESUME DECISION"
            onPress={() => router.push(`/results/${pending.search_id}`)}
            tone="signal"
          />
        </Card>
      ))}
      {query.data ? <Text style={styles.limit}>SERVER LIMIT · {query.data.pending.length}/{query.data.limit}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 11 },
  limit: {
    color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 11,
    letterSpacing: 1, marginTop: space[2], textAlign: 'center',
  },
});

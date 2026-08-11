import { palette } from '@perigee/design-tokens';
import { Card, Screen, StatusChip } from '@perigee/ui';
import { StyleSheet, Text } from 'react-native';

import { useFieldStore } from '../../src/state/fieldStore';

export default function ActivityScreen() {
  const activities = useFieldStore((state) => state.activities);
  return (
    <Screen eyebrow="LOCAL SESSION LOG" title="Activity">
      {activities.length === 0 ? (
        <Card eyebrow="No local events" title="Quiet shift">
          <Text style={styles.copy}>Decisions recorded from this installation appear here. The backend audit chain remains authoritative.</Text>
        </Card>
      ) : activities.map((entry) => (
        <Card
          eyebrow={new Date(entry.createdAt).toLocaleString()}
          key={entry.id}
          title={entry.title}
          trailing={<StatusChip tone={entry.tone} />}
        >
          <Text style={styles.copy}>{entry.detail}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
});

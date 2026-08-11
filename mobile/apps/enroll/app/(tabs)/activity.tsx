import { palette } from '@perigee/design-tokens';
import { Card, Screen, StatusChip } from '@perigee/ui';
import { StyleSheet, Text } from 'react-native';

import { useEnrollStore } from '../../src/state/enrollStore';

export default function ActivityScreen() {
  const activities = useEnrollStore((state) => state.activities);
  return (
    <Screen eyebrow="Local operation log" title="Activity">
      {activities.length === 0 ? <Card title="No activity"><Text style={styles.copy}>Enrollment events recorded on this device will appear here.</Text></Card> : activities.map((item) => (
        <Card key={item.id} eyebrow={new Date(item.createdAt).toLocaleString()} title={item.title} trailing={<StatusChip label={item.tone.toUpperCase()} tone={item.tone} />}>
          <Text style={styles.copy}>{item.detail}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 } });

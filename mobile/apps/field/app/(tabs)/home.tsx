import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useFieldStore } from '../../src/state/fieldStore';

export default function HomeScreen() {
  const session = useFieldStore((state) => state.session);
  const apiUrl = useFieldStore((state) => state.apiUrl);
  const deviceKey = useFieldStore((state) => state.deviceKey);
  const activities = useFieldStore((state) => state.activities);
  return (
    <Screen
      action={<Button label="START SCREENING" onPress={() => router.push('/scan/capture')} size="primary" />}
      eyebrow={session ? `SEARCHING AS ${session.officerId}` : 'SHIFT NOT STARTED'}
      title="Field desk"
    >
      <SyntheticBanner />
      <View style={styles.statusRow}>
        <StatusChip label="CAMERA NATIVE" tone="clear" />
        <StatusChip label={deviceKey ? 'API KEY SET' : 'API KEY NEEDED'} tone={deviceKey ? 'clear' : 'warn'} />
      </View>
      <Card eyebrow="Operational status" title="Ready for a check" tone="signal">
        <Text style={styles.copy}>
          Capture stays local. Development search uses a generated synthetic probe vector selected after review.
        </Text>
        <Text style={styles.mono}>{apiUrl}</Text>
      </Card>
      <Card eyebrow="Open work" title="Pending decisions" trailing={<Text style={styles.count}>0</Text>}>
        <Text style={styles.copy}>The server will block the fourth unresolved search. Resolve every result deliberately.</Text>
        <Button label="VIEW PENDING" onPress={() => router.push('/(tabs)/pending')} tone="data" />
      </Card>
      <Card eyebrow="This installation" title="Recent activity">
        <Text style={styles.copy}>{activities.length === 0 ? 'No recorded decisions in this session.' : activities[0]?.title}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 12 },
  count: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 32 },
});

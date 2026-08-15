import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { useEnrollStore } from '../../src/state/enrollStore';

export default function MoreScreen() {
  const operatorId = useEnrollStore((state) => state.operatorId);
  return (
    <Screen eyebrow="Perigee // Enroll" title="More">
      <SyntheticBanner compact />
      <Card eyebrow="Current attribution" title={operatorId || 'Unattributed'}><Button label="CHANGE OPERATOR" onPress={() => router.push('/operator')} tone="neutral" /></Card>
      <Card eyebrow="Device" title="Configuration">
        <Button label="CONNECTION" onPress={() => router.push('/settings/connection')} tone="data" />
        <Button label="UPLOAD QUEUE" onPress={() => router.push('/settings/uploads')} tone="neutral" />
        <Button label="DIAGNOSTICS" onPress={() => router.push('/settings/diagnostics')} tone="neutral" />
      </Card>
      <Card eyebrow="Project" title="Source & contacts"><Text style={styles.copy}>Repository, issue tracker and implementation boundaries.</Text><Button label="ABOUT & CONTACTS" onPress={() => router.push('/settings/about')} tone="data" /></Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 } });

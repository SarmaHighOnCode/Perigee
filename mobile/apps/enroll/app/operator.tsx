import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { FormField } from '../src/components/FormField';
import { useEnrollStore } from '../src/state/enrollStore';

export default function OperatorScreen() {
  const current = useEnrollStore((state) => state.operatorId);
  const setOperator = useEnrollStore((state) => state.setOperator);
  const [operatorId, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  function continueToDesk() {
    const normalized = operatorId.trim();
    if (!normalized) return setError('Operator ID is required for audit attribution');
    setOperator(normalized);
    router.replace('/(tabs)/roster');
  }

  return (
    <Screen action={<Button label="OPEN ENROLLMENT DESK" onPress={continueToDesk} size="primary" />} eyebrow="Perigee // Enroll" title="Operator desk">
      <SyntheticBanner compact />
      <Card eyebrow="Attribution, not authentication" title="Who is operating?">
        <Text style={styles.copy}>This identifier is attached to enrollment API requests. The backend PR does not yet authenticate or independently verify it.</Text>
        <FormField autoCapitalize="characters" label="OPERATOR ID" onChangeText={setValue} placeholder="ENROLL-204" value={operatorId} />
      </Card>
      <Card eyebrow="Privacy" title="Local drafts" tone="data">
        <Text style={styles.copy}>Drafts persist on this handset as fields and file URIs only. Image bytes are never copied into AsyncStorage.</Text>
      </Card>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { useEnrollStore } from '../../src/state/enrollStore';

export default function ConnectionScreen() {
  const currentUrl = useEnrollStore((state) => state.apiUrl);
  const currentKey = useEnrollStore((state) => state.deviceKey);
  const setConnection = useEnrollStore((state) => state.setConnection);
  const [apiUrl, setApiUrl] = useState(currentUrl);
  const [deviceKey, setDeviceKey] = useState(currentKey);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      const url = new URL(apiUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API URL must use HTTP or HTTPS');
      const normalized = url.toString().replace(/\/$/, '');
      await Promise.all([
        SecureStore.setItemAsync('perigee.apiUrl', normalized),
        SecureStore.setItemAsync('perigee.deviceKey', deviceKey.trim()),
      ]);
      setConnection(normalized, deviceKey);
      setMessage('Connection stored on this Android device.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen action={<Button label="SAVE CONNECTION" onPress={() => void save()} size="primary" />} eyebrow="Device provisioning" title="Connection">
      <Card eyebrow="Backend" title="API endpoint">
        <FormField autoCapitalize="none" autoCorrect={false} keyboardType="url" label="BASE URL" onChangeText={setApiUrl} value={apiUrl} />
        <FormField autoCapitalize="none" autoCorrect={false} label="DEVICE KEY" onChangeText={setDeviceKey} secureTextEntry value={deviceKey} />
        <Text style={styles.copy}>The key and URL use Android SecureStore. Draft identity and file URIs use versioned AsyncStorage.</Text>
      </Card>
      <StatusChip label={currentKey ? 'DEVICE KEY PRESENT' : 'DEVICE KEY REQUIRED'} tone={currentKey ? 'clear' : 'warn'} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  success: { backgroundColor: palette.clear, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

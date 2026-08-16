import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { parseProbeFixtureBundle } from '../../src/domain/fixtures';
import { useFieldStore } from '../../src/state/fieldStore';

export default function ConnectionScreen() {
  const currentUrl = useFieldStore((state) => state.apiUrl);
  const currentKey = useFieldStore((state) => state.deviceKey);
  const currentBundle = useFieldStore((state) => state.fixtureBundle);
  const setConnection = useFieldStore((state) => state.setConnection);
  const setFixtureBundle = useFieldStore((state) => state.setFixtureBundle);
  const [apiUrl, setApiUrl] = useState(currentUrl);
  const [deviceKey, setDeviceKey] = useState(currentKey);
  const [fixtureJson, setFixtureJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pasteFixture() {
    setFixtureJson(await Clipboard.getStringAsync());
  }

  async function save() {
    setError(null);
    setMessage(null);
    try {
      const url = new URL(apiUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API URL must use HTTP or HTTPS');
      let bundle = currentBundle;
      if (fixtureJson.trim()) bundle = parseProbeFixtureBundle(JSON.parse(fixtureJson));
      await Promise.all([
        SecureStore.setItemAsync('perigee.apiUrl', url.toString().replace(/\/$/, '')),
        SecureStore.setItemAsync('perigee.deviceKey', deviceKey.trim()),
      ]);
      setConnection(url.toString().replace(/\/$/, ''), deviceKey);
      setFixtureBundle(bundle);
      setMessage(bundle ? 'Connection and verified probe bundle loaded.' : 'Connection saved. Probe bundle is still missing.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen
      action={<Button label="SAVE CONNECTION" onPress={() => void save()} size="primary" />}
      eyebrow="LOCAL DEVICE CONFIG"
      title="Connection"
    >
      <SyntheticBanner compact />
      <Card eyebrow="Backend" title="API endpoint">
        <Text style={styles.label}>BASE URL</Text>
        <TextInput
          accessibilityLabel="Perigee API base URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setApiUrl}
          style={styles.input}
          value={apiUrl}
        />
        <Text style={styles.label}>DEVICE KEY</Text>
        <TextInput
          accessibilityLabel="Perigee development device key"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setDeviceKey}
          secureTextEntry
          style={styles.input}
          value={deviceKey}
        />
        <Text style={styles.copy}>Stored with Android SecureStore. This identifies a provisioned handset; it is not officer authentication.</Text>
      </Card>
      <Card eyebrow="Backend CI artifact" title="Probe fixtures" tone="data">
        <StatusChip label={currentBundle ? 'FIXTURES LOADED' : 'FIXTURES REQUIRED'} tone={currentBundle ? 'clear' : 'warn'} />
        <Text style={styles.copy}>Paste the complete generated `probe-fixtures` JSON. It is validated for dimension, normalization and its connectivity-only notice.</Text>
        <TextInput
          accessibilityLabel="Generated probe fixture JSON"
          autoCapitalize="none"
          multiline
          onChangeText={setFixtureJson}
          placeholder="{ &quot;model_id&quot;: … }"
          placeholderTextColor="#555"
          style={[styles.input, styles.fixtureInput]}
          value={fixtureJson}
        />
        <Button label="PASTE FIXTURE JSON" onPress={() => void pasteFixture()} tone="data" />
      </Card>
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 11, letterSpacing: 1 },
  input: {
    backgroundColor: palette.canvasSoft, borderColor: palette.primary, borderRadius: 4,
    borderWidth: structure.borderWidth, color: palette.primary, fontFamily: 'MartianMono',
    fontSize: 14, minHeight: 54, padding: space[3],
  },
  fixtureInput: { minHeight: 150, textAlignVertical: 'top' },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 13, lineHeight: 19 },
  success: { backgroundColor: palette.clear, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

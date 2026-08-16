import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { sourceRepositoryUrl } from '../../src/navigation/routes';

export default function AboutScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const issuesUrl = `${sourceRepositoryUrl}/issues`;
  async function copy() {
    await Clipboard.setStringAsync(sourceRepositoryUrl);
    setMessage('Repository URL copied.');
  }
  return (
    <Screen eyebrow="Open source contacts" title="About">
      <SyntheticBanner compact />
      <Card eyebrow="Repository" title="SarmaHighOnCode / Perigee" tone="data">
        <Text selectable style={styles.url}>{sourceRepositoryUrl}</Text>
        <Button label="OPEN GITHUB" onPress={() => void Linking.openURL(sourceRepositoryUrl)} tone="data" />
        <Button label="OPEN ISSUES / CONTACT" onPress={() => void Linking.openURL(issuesUrl)} tone="neutral" />
        <Button label="COPY REPOSITORY URL" onPress={() => void copy()} tone="neutral" />
      </Card>
      <Card eyebrow="Current capability" title="Honest boundary">
        <Text style={styles.copy}>Person creation, original-quality camera/gallery acquisition, lossless metadata stripping, presigned upload and media commit are implemented. Face embeddings, authentication, case writes and relationship writes remain deferred or backend-pending.</Text>
      </Card>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  url: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 12 },
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  message: { backgroundColor: palette.clear, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

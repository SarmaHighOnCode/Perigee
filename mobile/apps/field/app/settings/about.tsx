import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner, contactActions } from '@perigee/ui';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { StyleSheet, Text } from 'react-native';

export default function AboutScreen() {
  return (
    <Screen eyebrow="PROJECT & SUPPORT" title="About Perigee">
      <SyntheticBanner />
      <Card eyebrow="Perigee Field" title={`Version ${Constants.expoConfig?.version ?? '0.1.0'}`} tone="signal">
        <Text style={styles.copy}>Android screening client built on the locally validated Expo native camera stack.</Text>
        <Text selectable style={styles.mono}>{contactActions.repository}</Text>
      </Card>
      <Button label="OPEN GITHUB REPOSITORY" onPress={() => void Linking.openURL(contactActions.repository)} tone="data" />
      <Button label="COPY REPOSITORY URL" onPress={() => void Clipboard.setStringAsync(contactActions.repository)} tone="neutral" />
      <Button label="REPORT AN ISSUE" onPress={() => void Linking.openURL(contactActions.issues)} tone="warn" />
      <Card eyebrow="Honest scope" title="Recognition deferred">
        <Text style={styles.copy}>This build validates mobile capture, gallery, navigation and backend connectivity. It does not claim face-recognition accuracy.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  mono: { color: palette.primary, fontFamily: 'MartianMono', fontSize: 11, lineHeight: 17 },
});

import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { fixtureDefinitions, type FixtureName } from '../../src/domain/fixtures';
import { useFieldStore } from '../../src/state/fieldStore';

export default function FixtureScreen() {
  const media = useFieldStore((state) => state.media);
  const selected = useFieldStore((state) => state.fixtureName);
  const bundle = useFieldStore((state) => state.fixtureBundle);
  const setSelected = useFieldStore((state) => state.setFixtureName);
  if (!media) return <Redirect href="/scan/capture" />;
  return (
    <Screen
      action={<Button disabled={!selected} label="RUN SYNTHETIC SEARCH" onPress={() => router.push('/scan/searching')} size="primary" />}
      eyebrow="STEP 3 · CONNECTIVITY PROBE"
      title="Choose outcome"
    >
      <SyntheticBanner />
      {!bundle ? (
        <Card eyebrow="Generated artifact required" title="Probe vectors not loaded" tone="warn">
          <Text style={styles.copy}>Load the backend CI `probe-fixtures` JSON under Connection. The selected flow can be designed now, but a search cannot be sent without its verified 512-D vector.</Text>
          <Button label="OPEN CONNECTION" onPress={() => router.push('/settings/connection')} tone="data" />
        </Card>
      ) : null}
      {(Object.entries(fixtureDefinitions) as [FixtureName, (typeof fixtureDefinitions)[FixtureName]][]).map(([name, definition]) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === name }}
          key={name}
          onPress={() => setSelected(name)}
          style={[styles.fixture, selected === name && styles.fixtureSelected]}
        >
          <Text style={styles.name}>{name.replace('FIXTURE_', '')}</Text>
          <Text style={styles.title}>{definition.title}</Text>
          <Text style={styles.copy}>{definition.description}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fixture: {
    backgroundColor: palette.paper, borderColor: palette.ink, borderWidth: structure.borderWidth,
    gap: space[1], minHeight: 96, padding: space[3],
  },
  fixtureSelected: { backgroundColor: palette.signal, shadowColor: palette.ink, shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0 },
  name: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 11, letterSpacing: 1 },
  title: { color: palette.ink, fontFamily: 'Archivo', fontSize: 18, fontWeight: '900', textTransform: 'uppercase' },
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 20 },
});

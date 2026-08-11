import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { useFieldStore } from '../../src/state/fieldStore';

export default function SearchingScreen() {
  const client = usePerigeeClient();
  const session = useFieldStore((state) => state.session);
  const fixtureName = useFieldStore((state) => state.fixtureName);
  const bundle = useFieldStore((state) => state.fixtureBundle);
  const setSearch = useFieldStore((state) => state.setSearch);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const fixture = fixtureName ? bundle?.fixtures[fixtureName] : undefined;

  useEffect(() => {
    if (started.current || !session || !bundle || !fixtureName || !fixture) return;
    started.current = true;
    void client.search({
      embedding: fixture.embedding,
      model_id: bundle.model_id,
      quality: { score: 1 },
      reason_code: session.reasonCode,
    }).then((response) => {
      setSearch(response);
      router.replace({ pathname: '/results/[searchId]', params: { searchId: response.search_id } });
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [bundle, client, fixture, fixtureName, session, setSearch]);

  if (!session) return <Redirect href="/shift" />;
  return (
    <Screen eyebrow="STEP 4 · SERVER SEARCH" title="Searching">
      <SyntheticBanner />
      {!bundle || !fixture ? (
        <Card eyebrow="Cannot submit" title="Verified fixture missing" tone="warn">
          <Text style={styles.copy}>Load the generated probe fixture artifact, then return to fixture selection.</Text>
          <Button label="OPEN CONNECTION" onPress={() => router.replace('/settings/connection')} tone="data" />
        </Card>
      ) : error ? (
        <Card eyebrow="Search failed" title="Connection needs attention" tone="alert">
          <Text style={styles.copy}>{error}</Text>
          <Button label="TRY AGAIN" onPress={() => router.replace('/scan/fixture')} tone="warn" />
        </Card>
      ) : (
        <Card eyebrow={fixtureName ?? ''} title="Candidate ranking in progress" tone="data">
          <ActivityIndicator color={palette.ink} size="large" />
          <Text style={styles.copy}>The server returns ranked candidates only. It never returns a match assertion.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
});

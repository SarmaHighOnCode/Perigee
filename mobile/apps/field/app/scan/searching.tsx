import { palette } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { prepareSearch } from '../../src/services/prepareSearch';
import { useFieldStore } from '../../src/state/fieldStore';

export default function SearchingScreen() {
  const client = usePerigeeClient();
  const session = useFieldStore((state) => state.session);
  const probe = useFieldStore((state) => state.probe);
  const setSearch = useFieldStore((state) => state.setSearch);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !session || !probe) return;
    started.current = true;
    const payload = prepareSearch([{ embedding: probe.embedding, quality: probe.quality, modelId: probe.modelId }]);
    void client.search({
      ...payload,
      reason_code: session.reasonCode,
    }).then((response) => {
      setSearch(response);
      router.replace({ pathname: '/results/[searchId]', params: { searchId: response.search_id } });
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [client, probe, session, setSearch]);

  if (!session) return <Redirect href="/shift" />;
  return (
    <Screen eyebrow="STEP 4 · SERVER SEARCH" title="Searching">
      <SyntheticBanner />
      {!probe ? (
        <Card eyebrow="Cannot submit" title="No processed capture" tone="warn">
          <Text style={styles.copy}>Process a capture on-device before searching.</Text>
          <Button label="BACK TO CAPTURE" onPress={() => router.replace('/scan/capture')} tone="data" />
        </Card>
      ) : error ? (
        <Card eyebrow="Search failed" title="Connection needs attention" tone="alert">
          <Text style={styles.copy}>{error}</Text>
          <Button label="TRY AGAIN" onPress={() => router.replace('/scan/fixture')} tone="warn" />
        </Card>
      ) : (
        <Card eyebrow={`QUALITY ${probe.quality.score.toFixed(2)}`} title="Candidate ranking in progress" tone="data">
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={styles.copy}>The server returns ranked candidates only. It never returns a match assertion.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
});

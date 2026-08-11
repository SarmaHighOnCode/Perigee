import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PendingSearch } from '@perigee/api-client';
import { palette, space } from '@perigee/design-tokens';
import { Banner, Brut, Button } from '@perigee/ui';

import { getClient } from '../lib/perigee';
import { useSession } from '../lib/session';

/**
 * The human-in-the-loop brake, given a surface.
 *
 * Reached when the API returns 429 PENDING_DECISION_LIMIT. This screen cannot
 * be dismissed without adjudicating — that is the policy, not a UX accident.
 */
export default function Pending() {
  const { shift } = useSession();
  const [items, setItems] = useState<PendingSearch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift) return;
    void getClient(shift.officerId)
      .pending()
      .then((result) => setItems(result.pending))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [shift]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Banner tone="warn" dismissible={false}
          title="SEARCHES AWAIT ADJUDICATION"
          message="Every search must end in a decision. New searches are blocked until these are resolved."
        />

      {error ? (
        <Banner tone="alert" dismissible={false}
          title={error}
        />
      ) : null}

      {items.map((item) => (
        <Brut key={item.search_id} tone="paper" style={styles.item}>
          <Text style={styles.itemMeta}>
            {item.reason_code.toUpperCase().replace('_', ' ')} · {item.candidate_count} CANDIDATES
          </Text>
          <Text style={styles.itemAge}>OPEN {Math.round(item.age_seconds / 60)} MIN</Text>
          <Button
            variant="solid"
            tone="signal"
            size="secondary"
            onPress={() => router.push(`/results/${item.search_id}`)}
            label="ADJUDICATE"
          />
        </Brut>
      ))}

      {items.length === 0 && !error ? (
        <Text style={styles.body}>Nothing pending. You can resume searching.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[3], padding: space[3] },
  title: { color: palette.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  body: { color: palette.ink, fontSize: 13, lineHeight: 18, marginTop: 2 },
  item: { gap: space[2], padding: space[3] },
  itemMeta: { color: palette.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  itemAge: { color: palette.ink, fontSize: 11, opacity: 0.7 },
});

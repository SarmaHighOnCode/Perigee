import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Candidate, SearchDetail } from '@perigee/api-client';
import { palette, space } from '@perigee/design-tokens';
import { Banner, Button, CandidateTile } from '@perigee/ui';

import { getClient } from '../../lib/perigee';
import { useSession } from '../../lib/session';

export default function Results() {
  const { searchId } = useLocalSearchParams<{ searchId: string }>();
  const { shift } = useSession();
  const navigation = useNavigation();

  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // How long the human actually looked. A cluster of sub-second confirmations
  // is not careful review, and detecting that costs one integer.
  const renderedAt = useRef(Date.now());

  useEffect(() => {
    if (!shift || !searchId) return;
    void getClient(shift.officerId)
      .getSearch(searchId)
      .then((result) => {
        setDetail(result);
        renderedAt.current = Date.now();
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [searchId, shift]);

  const decide = useCallback(
    async (decision: 'CONFIRMED' | 'NO_MATCH' | 'INCONCLUSIVE' | 'ABORTED') => {
      if (!shift || !searchId || submitting) return;
      setSubmitting(true);
      try {
        await getClient(shift.officerId).decide(searchId, {
          decision,
          ...(decision === 'CONFIRMED' && selected !== null
            ? { confirmed_rank: selected }
            : {}),
          latency_ms: Date.now() - renderedAt.current,
        });

        if (decision === 'CONFIRMED' && detail) {
          const person = detail.candidates.find((c) => c.rank === selected)?.person_id;
          router.replace(`/person/${person}?search_id=${searchId}`);
        } else {
          router.replace('/capture');
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setSubmitting(false);
      }
    },
    [detail, searchId, selected, shift, submitting],
  );

  // A search does not close until a human adjudicates it. Leaving requires an
  // explicit ABORTED, which is itself recorded. This is the load-bearing
  // safety property of the product and it lives one careless navigation
  // refactor away from being broken.
  useEffect(() => {
    const onBack = () => {
      Alert.alert(
        'A DECISION IS REQUIRED',
        'This search is logged and cannot be abandoned silently. Recording "inconclusive" is a valid outcome.',
        [
          { text: 'STAY', style: 'cancel' },
          { text: 'RECORD ABORTED', style: 'destructive', onPress: () => void decide('ABORTED') },
        ],
      );
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (event?.data?.action?.type === 'REPLACE') return;
      event.preventDefault();
      onBack();
    });

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [decide, navigation]);

  if (error) {
    return (
      <View style={styles.page}>
        <Banner tone="alert" dismissible={false}
          title={error}
        />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.page}>
        <Text style={styles.status}>LOADING CANDIDATES…</Text>
      </View>
    );
  }

  const candidates: Candidate[] = detail.candidates;
  const ambiguous = detail.score_gap !== null && detail.score_gap < 0.05;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Banner tone="signal" dismissible={false}
          title="HUMAN VERIFICATION REQUIRED"
          message="This system does not identify persons."
        />

        {ambiguous ? (
          <Banner tone="alert" dismissible={false}
          title="AMBIGUOUS — TWO SIMILAR CANDIDATES"
          message="Δ {detail.score_gap?.toFixed(4)} between the top two. Compare carefully."
        />
        ) : null}

        {candidates.length === 0 ? (
          // The outcome this product is actually built around, given the visual
          // weight to match.
          <View style={styles.release}>
            <Text style={styles.releaseTitle}>NO CANDIDATES</Text>
            <Text style={styles.releaseBody}>
              No record in the database resembles this person.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.count}>
              {candidates.length} CANDIDATES
              {detail.score_gap !== null ? ` · Δ ${detail.score_gap.toFixed(4)}` : ''}
            </Text>
            {candidates.map((candidate) => (
              <CandidateTile
                key={candidate.rank}
                name={candidate.masked_name}
                similarity={candidate.similarity}
                band={candidate.band}
                {...(candidate.mugshot_url ? { imageUri: candidate.mugshot_url } : {})}
                meta={[candidate.age_band, candidate.district].filter(Boolean).join(' · ')}
                selected={selected === candidate.rank}
                ambiguous={ambiguous && candidate.rank <= 2}
                onPress={() => setSelected(candidate.rank)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* NO MATCH is visually equal to CONFIRM, never a secondary link. A system
          that makes "found nothing" feel like failure will be used until it
          finds something. */}
      <View style={styles.actions}>
        <Button
          variant="solid"
          tone="clear"
          size="primary"
          disabled={submitting}
          onPress={() => void decide('NO_MATCH')}
          style={styles.action}
          label="NO MATCH"
        />
        <Button
          variant="solid"
          tone="signal"
          size="primary"
          disabled={submitting || selected === null}
          onPress={() => void decide('CONFIRMED')}
          style={styles.action}
          label="CONFIRM SELECTED"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: palette.paper, flex: 1 },
  scroll: { gap: space[3], padding: space[3], paddingBottom: space[8] },
  advisory: { color: palette.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  advisoryBody: { color: palette.ink, fontSize: 13, marginTop: 2 },
  count: { color: palette.ink, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  release: {
    backgroundColor: palette.clear,
    borderColor: palette.ink,
    borderWidth: 3,
    padding: space[6],
  },
  releaseTitle: { color: palette.ink, fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  releaseBody: { color: palette.ink, fontSize: 14, marginTop: space[2] },
  actions: {
    borderTopColor: palette.ink,
    borderTopWidth: 3,
    flexDirection: 'row',
    gap: space[2],
    padding: space[3],
  },
  action: { flex: 1 },
  status: { color: palette.ink, fontSize: 14, fontWeight: '800', padding: space[4] },
  errorText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
});

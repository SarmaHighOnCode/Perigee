import type { Decision } from '@perigee/api-client';
import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip, SyntheticBanner } from '@perigee/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePerigeeClient } from '../../src/api/usePerigeeClient';
import { buildDecision } from '../../src/domain/screening';
import { useFieldStore } from '../../src/state/fieldStore';

export default function ResultsScreen() {
  const { searchId } = useLocalSearchParams<{ searchId: string }>();
  const client = usePerigeeClient();
  const navigation = useNavigation();
  const storedSearch = useFieldStore((state) => state.search);
  const setSearch = useFieldStore((state) => state.setSearch);
  const addActivity = useFieldStore((state) => state.addActivity);
  const resetScreening = useFieldStore((state) => state.resetScreening);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderedAt = useRef(Date.now());
  const resolved = useRef(false);
  const detailQuery = useQuery({
    queryKey: ['search', searchId],
    queryFn: () => client.searchDetail(searchId),
    enabled: storedSearch?.search_id !== searchId,
  });
  const result = storedSearch?.search_id === searchId ? storedSearch : detailQuery.data;
  const isAmbiguous = result && 'ambiguous' in result ? result.ambiguous : false;

  const recordDecision = useCallback(async (decision: Decision) => {
    if (!result || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildDecision({
        decision,
        ...(selectedRank !== null ? { confirmedRank: selectedRank } : {}),
        renderedAtMs: renderedAt.current,
        decidedAtMs: Date.now(),
      });
      await client.decide(searchId, payload);
      resolved.current = true;
      addActivity({
        id: `${searchId}-${decision}`,
        title: decision.replace('_', ' '),
        detail: `${result.candidates.length} candidates reviewed · search ${searchId}`,
        tone: decision === 'NO_MATCH' ? 'clear' : decision === 'CONFIRMED' ? 'alert' : 'warn',
        createdAt: new Date().toISOString(),
      });
      if (decision === 'CONFIRMED') {
        const candidate = result.candidates.find((item) => item.rank === selectedRank);
        if (!candidate) throw new Error('The selected candidate is no longer available');
        router.replace({
          pathname: '/person/[id]',
          params: { id: candidate.person_id, searchId },
        });
      } else {
        setSearch(null);
        resetScreening();
        router.replace('/(tabs)/home');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }, [addActivity, client, resetScreening, result, searchId, selectedRank, setSearch, submitting]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (resolved.current) return;
    event.preventDefault();
    Alert.alert(
      'DECISION REQUIRED',
      'This search is logged. Return to the result or explicitly record ABORTED.',
      [
        { text: 'RETURN TO DECISION', style: 'cancel' },
        { text: 'RECORD ABORTED', style: 'destructive', onPress: () => void recordDecision('ABORTED') },
      ],
    );
  }), [navigation, recordDecision]);

  function confirmSelected() {
    if (selectedRank === null) return;
    if (isAmbiguous) {
      Alert.alert(
        'AMBIGUOUS SCORES',
        'The leading candidates are close. Compare the records again before recording confirmation.',
        [
          { text: 'REVIEW AGAIN', style: 'cancel' },
          { text: 'CONFIRM SELECTED', onPress: () => void recordDecision('CONFIRMED') },
        ],
      );
    } else {
      void recordDecision('CONFIRMED');
    }
  }

  return (
    <Screen eyebrow="HUMAN DECISION REQUIRED" title="Candidate review">
      <SyntheticBanner />
      {!result && detailQuery.isLoading ? <StatusChip label="LOADING FROZEN CANDIDATES" tone="data" /> : null}
      {detailQuery.error ? (
        <Card eyebrow="Cannot retrieve search" title="Results unavailable" tone="alert">
          <Text style={styles.copy}>{detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)}</Text>
        </Card>
      ) : null}
      {result?.candidates.length === 0 ? (
        <Card eyebrow="ZERO CANDIDATES RETURNED" title="No candidates · release" tone="clear">
          <Text style={styles.release}>RELEASE</Text>
          <Text style={styles.copy}>The best score was below the configured no-match floor. Record the human outcome to close this search.</Text>
          <Button label="RECORD NO MATCH" loading={submitting} onPress={() => void recordDecision('NO_MATCH')} size="primary" tone="clear" />
        </Card>
      ) : null}
      {result?.candidates.map((candidate) => {
        const selected = candidate.rank === selectedRank;
        const tone = candidate.band === 'STRONG' ? palette.alert : candidate.band === 'REVIEW' ? palette.data : palette.warn;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={candidate.person_id}
            onPress={() => setSelectedRank(candidate.rank)}
            style={[styles.candidate, { backgroundColor: tone }, selected && styles.selected]}
          >
            <View style={styles.rankBlock}>
              <Text style={styles.rank}>#{candidate.rank}</Text>
              <Text style={styles.score}>{candidate.similarity.toFixed(4)}</Text>
            </View>
            <View style={styles.candidateCopy}>
              <Text style={styles.band}>{candidate.band} CANDIDATE</Text>
              <Text style={styles.name}>{candidate.masked_name}</Text>
              <Text style={styles.meta}>{candidate.age_band ?? 'AGE UNKNOWN'} · {candidate.district ?? 'DISTRICT UNKNOWN'}</Text>
              <Text style={styles.meta}>{candidate.record_summary.case_count} CASES · {candidate.record_summary.convictions} CONVICTIONS</Text>
            </View>
          </Pressable>
        );
      })}
      {result && result.candidates.length > 0 ? (
        <View style={styles.actions}>
          <Button disabled={selectedRank === null} label="CONFIRM SELECTED" loading={submitting} onPress={confirmSelected} size="primary" />
          <Button label="RECORD NO MATCH" loading={submitting} onPress={() => void recordDecision('NO_MATCH')} size="primary" tone="clear" />
          <Button label="INCONCLUSIVE · RETRY" loading={submitting} onPress={() => void recordDecision('INCONCLUSIVE')} tone="warn" />
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Text style={styles.audit}>SEARCH {searchId} · BACK IS DISABLED UNTIL A DECISION IS RECORDED</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  release: { color: palette.ink, fontFamily: 'Archivo', fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  candidate: {
    borderColor: palette.ink, borderWidth: structure.borderWidth, flexDirection: 'row',
    gap: space[3], minHeight: 112, padding: space[3],
  },
  selected: { shadowColor: palette.ink, shadowOffset: { width: 8, height: 8 }, shadowOpacity: 1, shadowRadius: 0, transform: [{ translateX: -2 }, { translateY: -2 }] },
  rankBlock: { alignItems: 'flex-start', borderRightColor: palette.ink, borderRightWidth: 2, minWidth: 74, paddingRight: space[2] },
  rank: { color: palette.ink, fontFamily: 'Archivo', fontSize: 24, fontWeight: '900' },
  score: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 15, marginTop: 8 },
  candidateCopy: { flex: 1 },
  band: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 10, letterSpacing: 0.8 },
  name: { color: palette.ink, fontFamily: 'Archivo', fontSize: 21, fontWeight: '900', marginTop: 3 },
  meta: { color: palette.ink, fontFamily: 'PublicSansBold', fontSize: 11, marginTop: 4 },
  actions: { gap: space[3], marginTop: space[2] },
  error: { backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3, color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3] },
  audit: { color: palette.ink, fontFamily: 'MartianMono', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});

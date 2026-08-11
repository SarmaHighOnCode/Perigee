import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ReasonCode } from '@perigee/api-client';
import { palette, space } from '@perigee/design-tokens';
import { Banner, Brut, Button } from '@perigee/ui';

import { useSession } from '../lib/session';

const REASONS: { code: ReasonCode; label: string }[] = [
  { code: 'routine_check', label: 'ROUTINE CHECK' },
  { code: 'suspicious_conduct', label: 'SUSPICIOUS CONDUCT' },
  { code: 'warrant_service', label: 'WARRANT SERVICE' },
  { code: 'missing_person', label: 'MISSING PERSON' },
  { code: 'post_incident', label: 'POST INCIDENT' },
  { code: 'training', label: 'TRAINING' },
];

export default function ShiftStart() {
  const { shift, startShift, endShift } = useSession();
  const [officerId, setOfficerId] = useState(shift?.officerId ?? '');
  const [reason, setReason] = useState<ReasonCode>(shift?.reasonCode ?? 'routine_check');

  const valid = officerId.trim().length >= 3;

  async function begin() {
    await startShift(officerId.trim().toUpperCase(), reason);
    router.push('/capture');
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.wordmark}>PERIGEE</Text>
      <Text style={styles.tagline}>FIELD · IDENTITY SCREENING</Text>

      <Banner tone="alert" dismissible={false}
          title="SYNTHETIC DATA ONLY"
          message="This build searches a synthetic database using fixture vectors. It performs no face recognition and must not be used on any real person."
        />

      <Brut tone="paper" style={styles.field}>
        <Text style={styles.label}>OFFICER IDENTIFIER</Text>
        <TextInput
          accessibilityLabel="Officer identifier"
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={setOfficerId}
          placeholder="OFFICER-1147"
          placeholderTextColor="#0A0A0A66"
          style={styles.input}
          value={officerId}
        />
        {/* Overstating what this is would teach a false expectation. */}
        <Text style={styles.note}>
          Recorded with every search and shown on screen while you work. It is NOT verified — this
          build has no authentication.
        </Text>
      </Brut>

      <Text style={styles.label}>REASON FOR SEARCH</Text>
      <View style={styles.reasons}>
        {REASONS.map((option) => (
          <Button
            key={option.code}
            variant={reason === option.code ? 'solid' : 'outline'}
            tone={reason === option.code ? 'signal' : 'paper'}
            size="secondary"
            onPress={() => setReason(option.code)}
            style={styles.reason}
            label={option.label}
          />
        ))}
      </View>

      <Button
        variant="solid"
        tone="signal"
        size="primary"
        disabled={!valid}
        onPress={() => void begin()}
        label="BEGIN SHIFT"
      />

      {shift ? (
        <Button variant="ghost" tone="paper" size="secondary" onPress={() => void endShift()} label="END CURRENT SHIFT" />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[4], padding: space[4], paddingBottom: space[12] },
  wordmark: {
    color: palette.ink,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: space[8],
  },
  tagline: { color: palette.ink, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  bannerTitle: { color: palette.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  bannerBody: { color: palette.ink, fontSize: 13, lineHeight: 18, marginTop: 4 },
  field: { gap: space[2], padding: space[3] },
  label: { color: palette.ink, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  input: {
    borderColor: palette.ink,
    borderWidth: 3,
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    minHeight: 56,
    paddingHorizontal: space[3],
  },
  note: { color: palette.ink, fontSize: 12, lineHeight: 17, opacity: 0.8 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  reason: { flexBasis: '47%', flexGrow: 1 },
});

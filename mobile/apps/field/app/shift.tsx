import { reasonCodes, type ReasonCode } from '@perigee/api-client';
import { palette, space, structure } from '@perigee/design-tokens';
import { Button, Card, Screen, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createShiftSession } from '../src/domain/session';
import { useFieldStore } from '../src/state/fieldStore';

const labels: Record<ReasonCode, string> = {
  routine_check: 'Routine check',
  suspicious_conduct: 'Suspicious conduct',
  warrant_service: 'Warrant service',
  missing_person: 'Missing person',
  post_incident: 'Post incident',
  training: 'Training / demo',
  browse: 'Purpose-bound browse',
};

export default function ShiftScreen() {
  const setSession = useFieldStore((state) => state.setSession);
  const [officerId, setOfficerId] = useState('');
  const [reasonCode, setReasonCode] = useState<ReasonCode>('training');
  const [error, setError] = useState<string | null>(null);

  function startShift() {
    try {
      setSession(createShiftSession({
        officerId,
        reasonCode,
        startedAt: new Date().toISOString(),
      }));
      router.replace('/(tabs)/home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Shift details are invalid');
    }
  }

  return (
    <Screen
      action={<Button label="START 8-HOUR SHIFT" onPress={startShift} size="primary" />}
      eyebrow="PERIGEE // FIELD"
      title="Start shift"
    >
      <SyntheticBanner />
      <Card eyebrow="Attribution, not authentication" title="Who is operating?">
        <Text style={styles.copy}>
          This identifier is recorded with every search. It is asserted by this device and is not independently verified.
        </Text>
        <Text style={styles.label}>OFFICER ID</Text>
        <TextInput
          accessibilityLabel="Officer ID"
          autoCapitalize="characters"
          maxLength={64}
          onChangeText={setOfficerId}
          placeholder="OFFICER-1147"
          placeholderTextColor="#555"
          style={styles.input}
          value={officerId}
        />
      </Card>
      <Card eyebrow="Purpose binding" title="Reason code">
        <View style={styles.reasonGrid}>
          {reasonCodes.map((code) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: reasonCode === code }}
              key={code}
              onPress={() => setReasonCode(code)}
              style={[styles.reason, reasonCode === code && styles.reasonSelected]}
            >
              <Text style={styles.reasonText}>{labels[code]}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.ink, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  label: { color: palette.ink, fontFamily: 'MartianMonoBold', fontSize: 11, letterSpacing: 1.2 },
  input: {
    backgroundColor: palette.paper, borderColor: palette.ink, borderRadius: 4,
    borderWidth: structure.borderWidth, color: palette.ink, fontFamily: 'MartianMono',
    fontSize: 16, minHeight: 56, paddingHorizontal: space[3],
  },
  reasonGrid: { gap: space[2] },
  reason: {
    backgroundColor: palette.paper, borderColor: palette.ink, borderWidth: 2,
    justifyContent: 'center', minHeight: 52, paddingHorizontal: space[3],
  },
  reasonSelected: { backgroundColor: palette.signal, borderWidth: 3 },
  reasonText: { color: palette.ink, fontFamily: 'PublicSansBold', fontSize: 14 },
  error: {
    backgroundColor: palette.alert, borderColor: palette.ink, borderWidth: 3,
    color: palette.ink, fontFamily: 'PublicSansBold', padding: space[3],
  },
});

import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PersonDetail } from '@perigee/api-client';
import { palette, space } from '@perigee/design-tokens';
import { Banner, Brut, Button } from '@perigee/ui';

import { getClient } from '../../lib/perigee';
import { useSession } from '../../lib/session';

/**
 * The full record. Reachable only after a CONFIRMED decision for this exact
 * person — the server enforces it and returns 403 PURPOSE_NOT_AUTHORISED
 * otherwise. Identification is the only door into a record.
 */
export default function Person() {
  const { id, search_id: searchId } = useLocalSearchParams<{ id: string; search_id: string }>();
  const { shift } = useSession();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift || !id) return;
    void getClient(shift.officerId)
      .getPerson(id, searchId)
      .then(setPerson)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [id, searchId, shift]);

  if (error) {
    return (
      <View style={styles.page}>
        <Banner tone="alert" dismissible={false}
          title={error}
        />
        <Button variant="solid" tone="signal" size="primary" onPress={() => router.replace('/capture')} label="RETURN TO CAPTURE" />
      </View>
    );
  }

  if (!person) {
    return (
      <View style={styles.page}>
        <Text style={styles.body}>LOADING RECORD…</Text>
      </View>
    );
  }

  const primary = person.media.find((m) => m.is_primary) ?? person.media[0];

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.name}>{person.full_name.toUpperCase()}</Text>
      {person.aliases.length > 0 ? (
        <Text style={styles.aliases}>AKA {person.aliases.join(' · ')}</Text>
      ) : null}

      {primary?.url ? (
        <Brut tone="ink">
          <Image contentFit="cover" source={{ uri: primary.url }} style={styles.mugshot} />
        </Brut>
      ) : null}

      <Brut tone="paper" style={styles.block}>
        <Field label="DISTRICT" value={person.district ?? '—'} />
        <Field label="DATE OF BIRTH" value={person.dob ?? '—'} />
        <Field label="STATUS" value={person.status.toUpperCase()} />
      </Brut>

      <Text style={styles.section}>CASE HISTORY</Text>
      {person.cases.length === 0 ? (
        <Text style={styles.body}>No linked cases.</Text>
      ) : (
        person.cases.map((record) => (
          // 'convicted' and 'accused' render distinctly and are NEVER summed.
          // "3 cases" spanning one conviction and two withdrawn accusations is a
          // materially different fact from "3 convictions".
          <Brut
            key={`${record.case_id}-${record.role}`}
            tone={record.role === 'convicted' ? 'alert' : 'paper'}
            style={styles.case}
          >
            <Text style={styles.role}>{record.role.toUpperCase()}</Text>
            <Text style={styles.fir}>
              FIR {record.fir_number} · {record.station}
            </Text>
            {record.offence ? (
              <Text style={styles.offence}>
                {[record.offence.ipc_section, record.offence.bns_section]
                  .filter(Boolean)
                  .join(' / ')}{' '}
                — {record.offence.title}
              </Text>
            ) : null}
            <Text style={styles.meta}>
              {record.registered_on} · {record.status.toUpperCase()}
            </Text>
          </Brut>
        ))
      )}

      <Brut tone="data" style={styles.block}>
        <Text style={styles.section}>NETWORK</Text>
        <Text style={styles.body}>
          {person.graph_summary.immediate_associates} immediate associates · degree{' '}
          {person.graph_summary.degree}
        </Text>
      </Brut>

      <Button variant="solid" tone="signal" size="primary" onPress={() => router.replace('/capture')} label="NEXT SUBJECT" />
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: space[3], padding: space[3] },
  scroll: { gap: space[3], padding: space[3], paddingBottom: space[12] },
  name: { color: palette.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  aliases: { color: palette.ink, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  mugshot: { height: 320, width: '100%' },
  block: { gap: space[2], padding: space[3] },
  field: { gap: 2 },
  label: { color: palette.ink, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  value: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  section: { color: palette.ink, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  case: { gap: 3, padding: space[3] },
  role: { color: palette.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  fir: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  offence: { color: palette.ink, fontSize: 13 },
  meta: { color: palette.ink, fontSize: 11, opacity: 0.75 },
  body: { color: palette.ink, fontSize: 13, lineHeight: 18 },
});

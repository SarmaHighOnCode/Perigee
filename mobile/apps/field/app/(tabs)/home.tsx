import { space } from '@perigee/design-tokens';
import { Screen, SyntheticBanner } from '@perigee/ui';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useFieldStore } from '../../src/state/fieldStore';

export default function HomeScreen() {
  const session = useFieldStore((state) => state.session);
  const apiUrl = useFieldStore((state) => state.apiUrl);
  const deviceKey = useFieldStore((state) => state.deviceKey);
  const activities = useFieldStore((state) => state.activities);

  return (
    <Screen
      eyebrow={session ? `SEARCHING AS ${session.officerId}` : 'SHIFT NOT STARTED'}
      title="Field desk"
      tone="canvas"
    >
      <SyntheticBanner />

      {/* Card 1: Operational Status */}
      <View style={styles.premiumCard}>
        {/* System Tags */}
        <View style={styles.statusRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>CAMERA NATIVE</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{deviceKey ? 'API KEY SET' : 'API KEY NEEDED'}</Text>
          </View>
        </View>

        <View style={styles.opHeaderRow}>
          <Text style={styles.opTitle}>Ready for a check</Text>
        </View>
        <Text style={styles.opDesc}>
          Capture stays local. Development search uses a generated synthetic probe vector selected after review.
        </Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>{apiUrl}</Text>
        </View>
      </View>

      {/* Card 2: Pending Decisions */}
      <View style={styles.premiumCard}>
        <View style={styles.pendingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>Open work</Text>
            <Text style={styles.sectionTitle}>Pending decisions</Text>
          </View>
          <Text style={styles.massiveNumber}>0</Text>
        </View>
        <Text style={styles.opDesc}>The server will block the fourth unresolved search. Resolve every result deliberately.</Text>
        <TouchableOpacity style={styles.solidButton} onPress={() => router.push('/(tabs)/pending')} activeOpacity={0.8}>
          <Text style={styles.solidButtonText}>VIEW PENDING</Text>
        </TouchableOpacity>
      </View>

      {/* Card 3: Recent Activity */}
      <View style={styles.premiumCard}>
        <Text style={styles.sectionEyebrow}>This installation</Text>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <Text style={[styles.opDesc, { marginTop: 12, marginBottom: 0 }]}>
          {activities.length === 0 ? 'No recorded decisions in this session.' : activities[0]?.title}
        </Text>
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  premiumCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Platinum outline
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, // Ultra-low micro-shadow
    shadowRadius: 24,
    elevation: 2,
    marginBottom: 24, // Consistent spacing between cards
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 32,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9', // Whisper Grey
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  pillText: {
    color: '#64748B', // Slate Grey
    fontFamily: 'PublicSansBold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  opHeaderRow: {
    marginBottom: 12,
    justifyContent: 'center',
  },
  opTitle: {
    color: '#0F172A', // Charcoal
    fontFamily: 'PublicSansBold',
    fontSize: 24,
  },
  opDesc: {
    color: '#64748B', // Slate Grey
    fontFamily: 'PublicSans',
    fontSize: 14,
    lineHeight: 24, // 140%+ line height for breathing room
    marginBottom: 16,
    maxWidth: '85%', // Constrain line length
  },
  codeBlock: {
    backgroundColor: '#F1F5F9', // Soft technical background, no border
    padding: 12,
    borderRadius: 8,
  },
  codeText: {
    color: '#0F172A',
    fontFamily: 'MartianMonoBold',
    fontSize: 12,
  },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: '#64748B',
    fontFamily: 'PublicSans',
    fontSize: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#0F172A',
    fontFamily: 'PublicSansBold',
    fontSize: 18,
  },
  massiveNumber: {
    color: '#1E293B', // Softer charcoal
    fontFamily: 'PublicSansBold',
    fontSize: 42,
  },
  solidButton: {
    backgroundColor: '#0B132B', // Deep Navy
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  solidButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PublicSansBold',
    fontSize: 14,
    letterSpacing: 1,
  },
});

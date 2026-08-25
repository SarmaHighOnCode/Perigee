import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen, StatusChip } from '@perigee/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { WizardProgress } from '../../src/components/WizardProgress';
import { addRelationship, removeRelationship } from '../../src/domain/draft';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

// Must match the backend's ManualEdgeType literals exactly.
const edgeTypes = ['shared_address', 'shared_phone', 'same_mo', 'family', 'known_associate'] as const;

export default function RelationshipsScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [target, setTarget] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('known_associate');
  const [evidence, setEvidence] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleEvidence(caseId: string) {
    setEvidence((current) => {
      const next = new Set(current);
      if (next.has(caseId)) next.delete(caseId); else next.add(caseId);
      return next;
    });
  }

  function add() {
    if (!draft) return;
    if (!target.trim()) return setError('Enter the target person ID');
    if (evidence.size === 0) return setError('Select at least one linked case as evidence');
    saveDraft(addRelationship(draft, {
      targetPersonId: target.trim(),
      relationshipType,
      evidenceCaseIds: [...evidence],
    }));
    setTarget('');
    setEvidence(new Set());
    setError(null);
  }

  if (!draft) return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;

  const linkedCases = draft.cases;

  return (
    <Screen action={<Button label="REVIEW ENROLLMENT" onPress={() => router.push('/enroll/review')} size="primary" />} eyebrow="Evidence-first graph" title="Relationships">
      <WizardProgress current="relationships" />
      {linkedCases.length === 0 ? (
        <Card eyebrow="Evidence required" title="Link a case first" tone="warn">
          <Text style={styles.copy}>Relationships need at least one case as evidence. Go back and link a case, or skip this step.</Text>
        </Card>
      ) : (
        <Card eyebrow="Step 1 · how are they connected" title="Relationship type">
          {edgeTypes.map((type) => {
            const active = type === relationshipType;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={type}
                onPress={() => setRelationshipType(type)}
                style={({ pressed }) => [
                  styles.edgeOption,
                  active ? styles.edgeSelected : styles.edgeIdle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.edgeLabel, active ? styles.edgeLabelSelected : null]}>
                  {type.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      )}
      {linkedCases.length > 0 ? (
        <Card eyebrow="Step 2 · cite the evidence" title="Evidence cases">
          {linkedCases.map((item) => {
            const active = evidence.has(item.caseId);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                key={item.caseId}
                onPress={() => toggleEvidence(item.caseId)}
                style={({ pressed }) => [
                  styles.evidenceRow,
                  active ? styles.edgeSelected : styles.edgeIdle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.edgeLabel, active ? styles.edgeLabelSelected : null]}>
                  {active ? '☑' : '☐'}  {item.firNumber || item.caseId}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
      <Card eyebrow="Step 3 · who is connected" title="Target person">
        <FormField
          autoCapitalize="none"
          hint="Person ID from the roster or a previous enrollment."
          label="TARGET PERSON ID"
          onChangeText={setTarget}
          value={target}
        />
        <Button label="ADD RELATIONSHIP" onPress={add} tone="primary" />
      </Card>
      {draft.relationships.map((item) => (
        <Card
          key={`${item.targetPersonId}-${item.relationshipType}`}
          eyebrow={item.targetPersonId}
          title={item.relationshipType.replace(/_/g, ' ')}
          trailing={<StatusChip label={`${item.evidenceCaseIds.length} EVIDENCE`} tone="data" />}
        >
          <View style={styles.linkedRow}>
            <Text style={styles.copy}>{item.evidenceCaseIds.join(', ')}</Text>
            <Button
              label="REMOVE"
              onPress={() => saveDraft(removeRelationship(draft, item.targetPersonId, item.relationshipType))}
              tone="alert"
            />
          </View>
        </Card>
      ))}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  edgeOption: {
    alignItems: 'center',
    borderColor: palette.primary,
    borderRadius: 999,
    borderWidth: 3,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  edgeIdle: { backgroundColor: palette.canvas },
  edgeSelected: { backgroundColor: palette.primary },
  edgeLabel: { color: palette.primary, fontFamily: 'Archivo', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  edgeLabelSelected: { color: palette.onPrimary },
  evidenceRow: {
    borderColor: palette.primary,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  linkedRow: { alignItems: 'center', flexDirection: 'row', gap: space[2], justifyContent: 'space-between' },
  pressed: { opacity: 0.75, transform: [{ translateX: 1 }, { translateY: 1 }] },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

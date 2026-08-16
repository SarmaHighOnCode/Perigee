import { palette, space } from '@perigee/design-tokens';
import { Button, Card, Screen } from '@perigee/ui';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { FormField } from '../../src/components/FormField';
import { WizardProgress } from '../../src/components/WizardProgress';
import { setIdentity } from '../../src/domain/draft';
import { validateIdentity } from '../../src/domain/validation';
import { activeDraft, useEnrollStore } from '../../src/state/enrollStore';

export default function IdentityScreen() {
  const draft = useEnrollStore(activeDraft);
  const saveDraft = useEnrollStore((state) => state.saveDraft);
  const [fullName, setFullName] = useState(draft?.identity.full_name ?? '');
  const [aliases, setAliases] = useState(draft?.identity.aliases?.join(', ') ?? '');
  const [dob, setDob] = useState(draft?.identity.dob ?? '');
  const [district, setDistrict] = useState(draft?.identity.district ?? '');
  const [address, setAddress] = useState(draft?.identity.address_line ?? '');
  const [phone, setPhone] = useState(draft?.identity.phone ?? '');
  const identity = useMemo(() => ({
    full_name: fullName,
    aliases: aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
    dob: dob.trim() || null,
    district: district.trim() || null,
    address_line: address.trim() || null,
    phone: phone.trim() || null,
  }), [address, aliases, district, dob, fullName, phone]);
  const issues = validateIdentity(identity);

  function saveAndContinue() {
    if (!draft || issues.length > 0) return;
    saveDraft(setIdentity(draft, identity));
    router.push('/enroll/capture-front');
  }

  if (!draft) {
    return <Screen title="No active draft"><Button label="GO TO DRAFTS" onPress={() => router.replace('/(tabs)/drafts')} /></Screen>;
  }
  return (
    <Screen action={<Button disabled={issues.length > 0} label="SAVE & CONTINUE" onPress={saveAndContinue} size="primary" />} eyebrow="Enrollment identity" title="Identity">
      <WizardProgress current="identity" />
      <Card eyebrow="Required" title="Person details">
        <FormField label="FULL NAME" onChangeText={setFullName} placeholder="As recorded in source documents" value={fullName} />
        <FormField hint="Comma-separated; maximum 20." label="ALIASES" onChangeText={setAliases} value={aliases} />
        <FormField hint="YYYY-MM-DD or leave blank." keyboardType="numbers-and-punctuation" label="DATE OF BIRTH" onChangeText={setDob} value={dob} />
        <FormField label="DISTRICT" onChangeText={setDistrict} value={district} />
        <FormField label="PHONE" keyboardType="phone-pad" onChangeText={setPhone} value={phone} />
        <FormField label="ADDRESS" multiline onChangeText={setAddress} value={address} />
      </Card>
      <Card eyebrow="Backend contract" title="Strict fields" tone="data">
        <Text style={styles.copy}>The API rejects unknown fields. Gender and age band remain optional and can be added before production rollout.</Text>
      </Card>
      {issues.map((issue) => <Text accessibilityRole="alert" key={issue} style={styles.error}>{issue}</Text>)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: palette.alert, borderColor: palette.primary, borderWidth: 3, color: palette.primary, fontFamily: 'PublicSansBold', padding: space[3] },
});

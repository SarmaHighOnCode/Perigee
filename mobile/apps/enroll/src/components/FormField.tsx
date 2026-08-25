import { palette, space, structure } from '@perigee/design-tokens';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface FormFieldProps extends Pick<ComponentProps<typeof TextInput>,
  'autoCapitalize' | 'autoCorrect' | 'keyboardType' | 'multiline' | 'onSubmitEditing' | 'returnKeyType' | 'secureTextEntry'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  hint?: string;
  placeholder?: string;
}

export function FormField({ label, value, onChangeText, hint, multiline, ...inputProps }: FormFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        blurOnSubmit={multiline ? false : true}
        multiline={multiline}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholderTextColor="#666"
        style={[styles.input, multiline && styles.multiline, focused && styles.focused]}
        value={value}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space[2] },
  label: { color: palette.primary, fontFamily: 'MartianMonoBold', fontSize: 11, letterSpacing: 1 },
  input: {
    backgroundColor: palette.canvasSoft, borderColor: palette.primary, borderRadius: 4,
    borderWidth: structure.borderWidth, color: palette.primary, fontFamily: 'PublicSans',
    fontSize: 16, minHeight: 56, paddingHorizontal: space[3], paddingVertical: space[3],
  },
  focused: { backgroundColor: palette.canvas, borderColor: palette.signal },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  hint: { color: palette.primary, fontFamily: 'PublicSans', fontSize: 12, lineHeight: 17 },
});

import { palette, space, structure } from '@perigee/design-tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ChoiceGridProps {
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}

export function ChoiceGrid({ options, selected, onSelect }: ChoiceGridProps) {
  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.option,
              active ? styles.optionSelected : styles.optionIdle,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active ? styles.labelSelected : null]}>{option.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  option: {
    alignItems: 'center',
    borderColor: palette.primary,
    borderRadius: 999,
    borderWidth: structure.borderWidth,
    flexGrow: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  optionIdle: { backgroundColor: palette.canvas },
  optionSelected: { backgroundColor: palette.primary },
  pressed: { opacity: 0.75, transform: [{ translateX: 1 }, { translateY: 1 }] },
  label: { color: palette.primary, fontFamily: 'Archivo', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  labelSelected: { color: palette.onPrimary },
});

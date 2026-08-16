import { useState, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { palette, space, radii } from '@perigee/design-tokens';
import { Surface } from './Surface';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SelectProps<T extends string> {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  placeholder?: string;
  focused?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

const COLORS = {
  accent: '#0062FF',
  inputBg: '#F4F5F7',
  textDark: '#1A1A1A',
  placeholder: '#828282',
};

export function Select<T extends string>({ value, options, onChange, placeholder, focused, onOpen, onClose }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggleOpen = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextOpen = !open;
    setOpen(nextOpen);
    
    if (nextOpen && onOpen) onOpen();
    if (!nextOpen && onClose) onClose();

    Animated.timing(rotateAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const selectOption = (val: T) => {
    onChange(val);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(false);
    if (onClose) onClose();

    Animated.timing(rotateAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.container}>
      <Pressable 
        onPress={toggleOpen} 
        style={[
          styles.trigger, 
          open && styles.triggerOpen,
          focused && styles.triggerFocused
        ]}
      >
        <Text style={[styles.triggerText, !selectedOption && styles.placeholder]}>
          {selectedOption ? selectedOption.label : placeholder || 'Select an option'}
        </Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotation }] }]}>
          ▼
        </Animated.Text>
      </Pressable>
      
      {open ? (
        <View style={styles.dropdownContainer}>
          <Surface radius={0} tone="neutral" level={3} shadow style={styles.dropdown}>
            <ScrollView bounces={false} style={styles.scrollView} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.option,
                    option.value === value && styles.optionSelected,
                  ]}
                  onPress={() => selectOption(option.value)}
                >
                  <Text style={[styles.optionText, option.value === value && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                  {option.value === value ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Surface>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    position: 'relative',
  },
  trigger: {
    backgroundColor: COLORS.inputBg,
    borderColor: 'transparent',
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 60,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  triggerFocused: {
    borderColor: COLORS.accent,
  },
  triggerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  triggerText: {
    color: COLORS.textDark,
    fontFamily: 'PublicSans',
    fontSize: 16,
  },
  placeholder: {
    color: COLORS.placeholder,
  },
  chevron: {
    color: COLORS.placeholder,
    fontSize: 12,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 59, // overlaps the bottom border of the trigger perfectly
    left: 0,
    right: 0,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10, // For Android
  },
  dropdown: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopWidth: 0,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
    maxHeight: 250,
  },
  scrollView: {
    paddingVertical: space[2],
  },
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: {
    backgroundColor: 'rgba(0,0,0,0.03)', // subtle selected state
  },
  optionText: {
    color: COLORS.textDark,
    fontFamily: 'PublicSans',
    fontSize: 16,
  },
  optionTextSelected: {
    fontFamily: 'PublicSansBold',
  },
  checkmark: {
    color: COLORS.textDark,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

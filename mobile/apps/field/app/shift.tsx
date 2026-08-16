import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Dimensions, Pressable, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, interpolateColor } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Select } from '@perigee/ui';

// We mock the session login logic since we are changing domains
const { width, height } = Dimensions.get('window');

const COLORS = {
  navy: '#0B132B',
  slate: '#1C2541',
  gold: '#C5A059',
  white: '#FFFFFF',
  silver: '#A3A3A3',
  onyx: '#1A1A1A',
  themeBg: '#092634',
  themeSurface: '#F3F3DB',
  accent: '#C5A059',
};

const ROLES = [
  { label: 'Patrol Officer', value: 'patrol' },
  { label: 'Detective', value: 'detective' },
  { label: 'Sergeant', value: 'sergeant' },
  { label: 'Lieutenant', value: 'lieutenant' },
  { label: 'Captain', value: 'captain' },
];

function AnimatedInput({ label, value, onChangeText, secureTextEntry = false, isLast = false }: any) {
  const isFocused = useSharedValue(0);

  const handleFocus = () => { isFocused.value = withTiming(1, { duration: 250 }); };
  const handleBlur = () => { isFocused.value = withTiming(0, { duration: 250 }); };

  const animatedBorderStyle = useAnimatedStyle(() => {
    return {
      borderBottomWidth: isFocused.value === 1 ? 2 : 1,
      borderBottomColor: interpolateColor(
        isFocused.value,
        [0, 1],
        [COLORS.silver, COLORS.accent]
      )
    };
  });

  return (
    <View style={[styles.inputContainer, isLast ? null : styles.inputSpacing]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Animated.View style={[styles.inputWrapper, animatedBorderStyle]}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
      </Animated.View>
    </View>
  );
}

export default function ShiftScreen() {
  const insets = useSafeAreaInsets();
  const [officerId, setOfficerId] = useState('');
  const [role, setRole] = useState('');

  const buttonScale = useSharedValue(1);
  const shadowOffset = useSharedValue(8);

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
    shadowOffset.value = withSpring(2, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    shadowOffset.value = withSpring(8, { damping: 15, stiffness: 200 });
  };

  const handleSignIn = () => {
    Keyboard.dismiss();
    console.log('Authenticating:', officerId, role);
    router.replace('/(tabs)/home');
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
      shadowOffset: { width: 0, height: shadowOffset.value },
    };
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 1. Base Semi Circle (#0B132B) - Lowest Z-Index */}
      <View style={styles.baseSemiCircle} />

      {/* 2. Mid Layer (#1C2541) - Middle Z-Index */}
      <View style={styles.midLayer} />

      {/* 3. The Fluid Dome Surface (#FFFFFF) - Highest Z-Index */}
      <View style={styles.domeSurfaceWrapper}>
        <View style={styles.domeSurface} />
      </View>

      {/* 3. The UI Foreground */}
      <View style={[styles.foreground, { paddingTop: insets.top }]}>

        <View style={styles.headerContainer}>
          <Text style={styles.perigeeText}>Perigee</Text>
          <Text style={styles.subText}>field identity-screening system</Text>
          {/* <Text style={styles.headerText}>Login!!</Text> */}
        </View>

        <View style={styles.formContainer}>
          <AnimatedInput
            label="Officer ID"
            value={officerId}
            onChangeText={setOfficerId}
            isLast
          />

          <View style={styles.selectWrapper}>
            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.selectContainer}>
              <Select
                value={role}
                onChange={setRole}
                options={ROLES}
                placeholder="Select your role"
              />
            </View>
          </View>
        </View>

        <Animated.View style={[styles.buttonWrapper, buttonAnimatedStyle]}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handleSignIn}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Start shift</Text>
          </Pressable>
        </Animated.View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  baseSemiCircle: {
    position: 'absolute',
    top: -200,
    left: -150,
    right: -150,
    height: height * 0.45 + 200,
    backgroundColor: COLORS.navy, // #0B132B
    borderBottomLeftRadius: 1000,
    borderBottomRightRadius: 1000,
    zIndex: 0,
  },
  midLayer: {
    position: 'absolute',
    top: -200,
    left: -100,
    right: -100,
    height: height * 0.25 + 200,
    backgroundColor: COLORS.slate, // #1C2541
    borderBottomLeftRadius: 1000,
    borderBottomRightRadius: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1,
  },
  domeSurfaceWrapper: {
    position: 'absolute',
    top: '32%',
    left: -200,
    right: -200,
    bottom: -200,
    overflow: 'visible',
    zIndex: 2,
  },
  domeSurface: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 1000,
    borderTopRightRadius: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  foreground: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 50, // Space between bottom of screen and button
    justifyContent: 'space-between',
    zIndex: 10,
    elevation: 30, // For Android
  },
  headerContainer: {
    marginTop: '15%',
    alignItems: 'center',
  },
  perigeeText: {
    fontFamily: 'RocketDoodle',
    fontSize: 75,
    color: COLORS.accent,
    marginBottom: 4,
    textAlign: 'center',
  },
  subText: {
    fontFamily: 'PublicSans',
    fontSize: 14,
    color: COLORS.silver,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  headerText: {
    fontFamily: 'PublicSansBold',
    fontSize: 34,
    color: COLORS.white,
    marginTop: 45, // Pushed further down
    lineHeight: 42 * 1.1,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  inputContainer: {
    width: '100%',
  },
  inputSpacing: {
    marginBottom: 24,
  },
  inputLabel: {
    fontFamily: 'PublicSans',
    fontSize: 14,
    color: COLORS.silver,
    marginBottom: 4,
  },
  inputWrapper: {
    paddingVertical: 12,
  },
  textInput: {
    fontFamily: 'PublicSansBold',
    fontSize: 16,
    color: COLORS.onyx,
    padding: 0,
  },
  selectWrapper: {
    marginTop: 16, // Fixed tight margin
    zIndex: 10,
  },
  selectContainer: {
    marginTop: 4,
  },
  buttonWrapper: {
    width: '85%',
    alignSelf: 'center',
    shadowColor: COLORS.accent,
    shadowRadius: 24,
    shadowOpacity: 1,
    elevation: 20,
    zIndex: 1,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 50,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: 'PublicSansBold',
    fontSize: 16,
    textTransform: 'uppercase',
    color: COLORS.white,
  },
});

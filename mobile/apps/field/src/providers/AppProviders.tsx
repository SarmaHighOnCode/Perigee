import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black';
import { MartianMono_400Regular } from '@expo-google-fonts/martian-mono/400Regular';
import { MartianMono_700Bold } from '@expo-google-fonts/martian-mono/700Bold';
import { PublicSans_400Regular } from '@expo-google-fonts/public-sans/400Regular';
import { PublicSans_700Bold } from '@expo-google-fonts/public-sans/700Bold';
import { palette } from '@perigee/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useFieldStore } from '../state/fieldStore';

export function AppProviders({ children }: PropsWithChildren) {
  const setConnection = useFieldStore((state) => state.setConnection);
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 15_000 },
      mutations: { retry: false },
    },
  }));
  const [fontsLoaded] = useFonts({
    Archivo: Archivo_900Black,
    MartianMono: MartianMono_400Regular,
    MartianMonoBold: MartianMono_700Bold,
    PublicSans: PublicSans_400Regular,
    PublicSansBold: PublicSans_700Bold,
  });

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.paper);
    void Promise.all([
      SecureStore.getItemAsync('perigee.apiUrl'),
      SecureStore.getItemAsync('perigee.deviceKey'),
    ]).then(([apiUrl, deviceKey]) => {
      if (apiUrl || deviceKey) {
        setConnection(apiUrl ?? 'http://10.0.2.2:8000', deviceKey ?? '');
      }
    });
  }, [setConnection]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.signal} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ReducedMotionConfig mode={ReduceMotion.System} />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <StatusBar backgroundColor={palette.ink} style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    justifyContent: 'center',
  },
});

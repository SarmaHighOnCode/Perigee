import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@perigee/design-tokens';
import { SyntheticWatermark } from '@perigee/ui';

import { API_URL, getClient } from '../lib/perigee';
import {
  SessionContext,
  clearShift,
  loadShift,
  saveShift,
  type Shift,
} from '../lib/session';
import type { ReasonCode } from '@perigee/api-client';

export default function RootLayout() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [ready, setReady] = useState(false);
  const [warming, setWarming] = useState(true);
  const [warmMs, setWarmMs] = useState(0);

  useEffect(() => {
    void loadShift().then((existing) => {
      setShift(existing);
      setReady(true);
    });
  }, []);

  // Pre-warm on launch. Render's free tier spins down after 15 minutes idle and
  // cold-starts in ~50s; by the time the officer has entered their id the
  // instance is usually awake. docs/10-DEPLOYMENT.md §5.
  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => setWarmMs(Date.now() - startedAt), 250);
    void getClient('bootstrap')
      .health()
      .catch(() => undefined)
      .finally(() => {
        clearInterval(tick);
        setWarming(false);
      });
    return () => clearInterval(tick);
  }, []);

  const startShift = useCallback(async (officerId: string, reasonCode: ReasonCode) => {
    const next: Shift = { officerId, reasonCode, startedAt: new Date().toISOString() };
    await saveShift(next);
    setShift(next);
  }, []);

  const endShift = useCallback(async () => {
    await clearShift();
    setShift(null);
  }, []);

  const value = useMemo(() => ({ shift, startShift, endShift }), [shift, startShift, endShift]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <SessionContext.Provider value={value}>
        <StatusBar style="dark" />
        <View style={styles.root}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.paper },
              animation: 'fade',
            }}
          />

          {/* Determinate, labelled, and honest about the wait. A spinner says
              "something is wrong"; this says "expected, and finishing". */}
          {warming && warmMs > 3000 ? (
            <View style={styles.waking}>
              <Text style={styles.wakingText}>
                SYSTEM WAKING · {Math.round(warmMs / 1000)}s
              </Text>
              <View style={styles.wakingTrack}>
                <View
                  style={[styles.wakingFill, { width: `${Math.min(100, warmMs / 500)}%` }]}
                />
              </View>
              <Text style={styles.wakingHost}>{API_URL}</Text>
            </View>
          ) : null}

          {/* Mounted at the root with no prop to disable it. If a screenshot of
              this app ever circulates it must be impossible to mistake for an
              operational system. docs/08-SECURITY.md §9. */}
          <SyntheticWatermark datasetMode="synthetic" />
        </View>
      </SessionContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.paper, flex: 1 },
  waking: {
    backgroundColor: palette.signal,
    borderColor: palette.ink,
    borderTopWidth: 3,
    bottom: 0,
    left: 0,
    padding: 12,
    position: 'absolute',
    right: 0,
  },
  wakingText: { color: palette.ink, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  wakingTrack: {
    backgroundColor: palette.paper,
    borderColor: palette.ink,
    borderWidth: 2,
    height: 14,
    marginTop: 6,
  },
  wakingFill: { backgroundColor: palette.ink, height: '100%' },
  wakingHost: { color: palette.ink, fontSize: 10, marginTop: 4, opacity: 0.7 },
});

/**
 * Backend wiring for Perigee Field.
 *
 * The device key is injected at build time via EAS secrets and read through
 * expo-constants. It is a coarse gate that keeps the API off the open internet
 * and makes per-handset revocation possible — it proves nothing about the
 * person holding the device.
 */

import Constants from 'expo-constants';

import { createClient, type PerigeeClient } from '@perigee/api-client';
import { createFixtureEngine, type FaceEngine } from '@perigee/face';

function envValue(key: string, fallback = ''): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const value = process.env[key] ?? extra[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export const API_URL = envValue('EXPO_PUBLIC_API_URL', 'http://10.0.2.2:8000');
export const DEVICE_KEY = envValue('EXPO_PUBLIC_DEVICE_KEY');

let client: PerigeeClient | null = null;

export function getClient(officerId: string): PerigeeClient {
  // The officer id changes per shift, so the client is rebuilt rather than
  // memoised across shifts.
  client = createClient({
    baseUrl: API_URL,
    deviceKey: DEVICE_KEY,
    officerId,
  });
  return client;
}

/**
 * FACE RECOGNITION IS DELIBERATELY ON HOLD.
 *
 * This returns deterministic synthetic vectors that exercise the pgvector
 * search path and the decision loop. They are CONNECTIVITY FIXTURES and are
 * never presented to the officer as recognition results — the shift screen
 * says so in plain text.
 *
 * The real on-device SCRFD + ArcFace engine implements this same FaceEngine
 * interface, so nothing above this line changes when it lands.
 */
let engine: FaceEngine | null = null;

export function getFaceEngine(): FaceEngine {
  engine ??= createFixtureEngine();
  return engine;
}

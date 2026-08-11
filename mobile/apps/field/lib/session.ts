/**
 * Officer shift session.
 *
 * THIS IS NOT AUTHENTICATION. The officer identifier is asserted by whoever
 * holds the phone and nothing verifies it. It is recorded with every search and
 * displayed back on screen so the claim is at least attributable and visible.
 * See docs/ADR/0003-no-auth-defensible.md.
 *
 * Calling this a login would teach a false expectation, so the UI never does.
 */

import * as SecureStore from 'expo-secure-store';
import { createContext, useContext } from 'react';

import type { ReasonCode } from '@perigee/api-client';

const KEY = 'perigee.shift';

/** A shift, not a session token. Expires so a handset left in a car does not
 *  keep attributing searches to an officer who went home. */
const SHIFT_HOURS = 8;

export interface Shift {
  officerId: string;
  reasonCode: ReasonCode;
  startedAt: string;
}

export interface SessionValue {
  shift: Shift | null;
  startShift: (officerId: string, reasonCode: ReasonCode) => Promise<void>;
  endShift: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function isExpired(shift: Shift, now: Date = new Date()): boolean {
  const elapsedHours = (now.getTime() - new Date(shift.startedAt).getTime()) / 3_600_000;
  return elapsedHours >= SHIFT_HOURS;
}

export async function loadShift(): Promise<Shift | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const shift = JSON.parse(raw) as Shift;
    return isExpired(shift) ? null : shift;
  } catch {
    return null;
  }
}

export async function saveShift(shift: Shift): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(shift));
}

export async function clearShift(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

import type { ReasonCode } from '@perigee/api-client';

const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000;

export interface ShiftSession {
  officerId: string;
  reasonCode: ReasonCode;
  startedAt: string;
  expiresAt: string;
}

export function createShiftSession(input: {
  officerId: string;
  reasonCode: ReasonCode;
  startedAt: string;
}): ShiftSession {
  const officerId = input.officerId.trim();
  if (!officerId) throw new Error('Officer ID is required');
  if (officerId.length > 64) throw new Error('Officer ID must be at most 64 characters');
  const startedAtMs = Date.parse(input.startedAt);
  if (!Number.isFinite(startedAtMs)) throw new Error('Shift start time is invalid');
  return {
    officerId,
    reasonCode: input.reasonCode,
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(startedAtMs + SHIFT_DURATION_MS).toISOString(),
  };
}

export function isShiftActive(session: ShiftSession, now: string): boolean {
  const nowMs = Date.parse(now);
  return Number.isFinite(nowMs) && nowMs < Date.parse(session.expiresAt);
}

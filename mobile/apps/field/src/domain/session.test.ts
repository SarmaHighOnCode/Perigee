import { describe, expect, it } from 'vitest';

import { createShiftSession, isShiftActive } from './session';

describe('Field shift session', () => {
  it('normalizes officer attribution and expires after eight hours', () => {
    const session = createShiftSession({
      officerId: '  OFFICER-1147  ',
      reasonCode: 'routine_check',
      startedAt: '2026-08-11T02:00:00.000Z',
    });
    expect(session.officerId).toBe('OFFICER-1147');
    expect(session.expiresAt).toBe('2026-08-11T10:00:00.000Z');
    expect(isShiftActive(session, '2026-08-11T09:59:59.000Z')).toBe(true);
    expect(isShiftActive(session, '2026-08-11T10:00:00.000Z')).toBe(false);
  });

  it('rejects blank or oversized officer identifiers', () => {
    expect(() => createShiftSession({
      officerId: ' ', reasonCode: 'training', startedAt: '2026-08-11T02:00:00Z',
    })).toThrow('Officer ID is required');
    expect(() => createShiftSession({
      officerId: 'X'.repeat(65), reasonCode: 'training', startedAt: '2026-08-11T02:00:00Z',
    })).toThrow('64 characters');
  });
});

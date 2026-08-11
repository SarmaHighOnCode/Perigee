import { describe, expect, it } from 'vitest';

import {
  palette,
  statusLabels,
  structure,
  touchTargets,
} from './index';

describe('Perigee design tokens', () => {
  it('matches the documented operational palette exactly', () => {
    expect(palette).toEqual({
      ink: '#0A0A0A',
      paper: '#FFFEF0',
      void: '#0B0B10',
      slab: '#16161F',
      bone: '#E8E6D9',
      signal: '#FFE600',
      alert: '#FF3EA5',
      data: '#00C2CB',
      clear: '#00C853',
      warn: '#FF6B00',
    });
  });

  it('uses hard structure and field-sized targets', () => {
    expect(structure).toEqual({ borderWidth: 3, shadowOffset: 5, radius: 0 });
    expect(touchTargets.primary).toBeGreaterThanOrEqual(64);
    expect(touchTargets.secondary).toBeGreaterThanOrEqual(56);
    expect(touchTargets.icon).toBeGreaterThanOrEqual(48);
  });

  it('provides words for every semantic status tone', () => {
    expect(statusLabels).toEqual({
      signal: 'ACTION REQUIRED',
      alert: 'STRONG / ALERT',
      data: 'REVIEW / INFORMATION',
      clear: 'CLEAR / COMPLETE',
      warn: 'WEAK / DEGRADED',
      neutral: 'NOT TESTED',
    });
  });
});

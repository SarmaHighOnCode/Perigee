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
      primary: '#171717',
      onPrimary: '#ffffff',
      canvas: '#ffffff',
      canvasSoft: '#fafafa',
      hairline: '#ebebeb',
      mute: '#888888',
      // Accents are tuned so `primary` on them clears AA — they are fills that
      // carry dark text, never text themselves. See __tests__/contrast.test.ts.
      signal: '#1a80ff',
      alert: '#ff2b2b',
      data: '#888888',
      clear: '#1a80ff',
      warn: '#f5a623',
    });
  });

  it('keeps field-sized touch targets through the light redesign', () => {
    // Sized for a gloved thumb, one-handed, in direct sun. The visual language
    // changed; the hand holding the phone did not.
    expect(structure).toEqual({ borderWidth: 1 });
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

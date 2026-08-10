import { describe, expect, it } from 'vitest';

import { canCapture, isCameraActive } from './lifecycle';

describe('isCameraActive', () => {
  it('runs the camera only while Android reports the app active', () => {
    expect(isCameraActive('active')).toBe(true);
    expect(isCameraActive('inactive')).toBe(false);
    expect(isCameraActive('background')).toBe(false);
    expect(isCameraActive('unknown')).toBe(false);
  });
});

describe('canCapture', () => {
  it('requires an active app and a started camera session', () => {
    expect(canCapture(true, true, 'active', false)).toBe(true);
    expect(canCapture(false, true, 'active', false)).toBe(false);
    expect(canCapture(true, false, 'active', false)).toBe(false);
    expect(canCapture(true, true, 'background', false)).toBe(false);
    expect(canCapture(true, true, 'active', true)).toBe(false);
  });
});

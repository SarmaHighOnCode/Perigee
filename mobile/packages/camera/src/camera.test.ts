/**
 * Capability guards and lifecycle.
 *
 * These are pure functions extracted so they can be tested without a device.
 * Every rule here exists because the prototype hit it on real hardware.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CAPTURE_SETTINGS, guardSettings, optionalNativeToggle, projectCapabilities } from './capabilities';
import { canCapture, captureBlockedReason, isCameraActive } from './lifecycle';
import type { CameraDescriptor } from './types';

function descriptor(overrides: Partial<CameraDescriptor> = {}): CameraDescriptor {
  return {
    id: 'cam-0',
    name: 'Back Camera',
    position: 'back',
    type: 'wide-angle-camera',
    physicalDeviceCount: 1,
    isVirtual: false,
    hasFlash: true,
    hasTorch: true,
    supportsFocus: true,
    supportsExposure: true,
    supportsHdr: true,
    supportsLowLight: true,
    minZoom: 1,
    maxZoom: 8,
    minExposure: -4,
    maxExposure: 4,
    photoResolutions: [{ width: 4032, height: 3024 }],
    ...overrides,
  };
}

describe('optionalNativeToggle', () => {
  it('returns undefined when unsupported, so the prop is omitted entirely', () => {
    // VisionCamera treats undefined as "leave the native default" and false as
    // an explicit instruction. On some devices passing false for an
    // unsupported feature errors rather than being ignored.
    expect(optionalNativeToggle(false, true)).toBeUndefined();
    expect(optionalNativeToggle(false, false)).toBeUndefined();
  });

  it('passes the requested value through when supported', () => {
    expect(optionalNativeToggle(true, true)).toBe(true);
    expect(optionalNativeToggle(true, false)).toBe(false);
  });
});

describe('guardSettings', () => {
  it('forces flash off on a device without one', () => {
    const guarded = guardSettings(descriptor({ hasFlash: false }), {
      ...DEFAULT_CAPTURE_SETTINGS,
      flash: 'on',
    });
    expect(guarded.flash).toBe('off');
  });

  it('clamps zoom into the supported range', () => {
    const cam = descriptor({ minZoom: 1, maxZoom: 4 });
    expect(guardSettings(cam, { ...DEFAULT_CAPTURE_SETTINGS, zoom: 99 }).zoom).toBe(4);
    expect(guardSettings(cam, { ...DEFAULT_CAPTURE_SETTINGS, zoom: -5 }).zoom).toBe(1);
  });

  it('zeroes exposure when exposure bias is unsupported', () => {
    const guarded = guardSettings(descriptor({ supportsExposure: false }), {
      ...DEFAULT_CAPTURE_SETTINGS,
      exposure: 3,
    });
    expect(guarded.exposure).toBe(0);
  });

  it('disables hdr and low light when unsupported', () => {
    const guarded = guardSettings(
      descriptor({ supportsHdr: false, supportsLowLight: false }),
      { ...DEFAULT_CAPTURE_SETTINGS, hdr: true, lowLight: true },
    );
    expect(guarded.hdr).toBe(false);
    expect(guarded.lowLight).toBe(false);
  });

  it('is idempotent', () => {
    const cam = descriptor({ maxZoom: 3 });
    const once = guardSettings(cam, { ...DEFAULT_CAPTURE_SETTINGS, zoom: 10 });
    expect(guardSettings(cam, once)).toEqual(once);
  });
});

describe('projectCapabilities', () => {
  it('reports megapixels from the largest supported resolution', () => {
    const caps = projectCapabilities(
      descriptor({
        photoResolutions: [
          { width: 640, height: 480 },
          { width: 4032, height: 3024 },
        ],
      }),
    );
    expect(caps.maxPhotoMegapixels).toBeCloseTo(12.19, 2);
  });

  it('reports null rather than 0 when resolutions are unavailable', () => {
    // Some emulator profiles throw from getSupportedResolutions; the caller
    // substitutes an empty list, and "unknown" must not read as "zero".
    expect(projectCapabilities(descriptor({ photoResolutions: [] })).maxPhotoMegapixels).toBeNull();
  });
});

describe('canCapture', () => {
  it('requires session, preview, foreground, and not already capturing', () => {
    expect(canCapture(true, true, 'active', false)).toBe(true);
  });

  it.each([
    ['session not running', false, true, 'active', false],
    ['preview not running', true, false, 'active', false],
    ['app backgrounded', true, true, 'background', false],
    ['already capturing', true, true, 'active', true],
  ])('refuses when %s', (_label, session, preview, state, capturing) => {
    expect(canCapture(session, preview, state, capturing)).toBe(false);
  });

  it('treats a null app state as not active', () => {
    expect(isCameraActive(null)).toBe(false);
    expect(isCameraActive(undefined)).toBe(false);
  });
});

describe('captureBlockedReason', () => {
  it('returns null when capture is available', () => {
    expect(captureBlockedReason(true, true, 'active', false)).toBeNull();
  });

  it('explains the block rather than leaving a dead button', () => {
    expect(captureBlockedReason(true, true, 'active', true)).toBe('CAPTURING');
    expect(captureBlockedReason(true, true, 'background', false)).toBe('APP NOT IN FOREGROUND');
    expect(captureBlockedReason(false, false, 'active', false)).toBe('STARTING CAMERA SESSION');
    expect(captureBlockedReason(true, false, 'active', false)).toBe('STARTING PREVIEW');
  });
});

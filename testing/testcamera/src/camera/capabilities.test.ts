import { describe, expect, it } from 'vitest';

import {
  guardSettings,
  optionalNativeToggle,
  projectCapabilities,
} from './capabilities';

const fullCamera = {
  id: 'back-wide',
  name: 'Back Wide Camera',
  position: 'back' as const,
  type: 'wide-angle',
  physicalDeviceCount: 2,
  isVirtual: true,
  hasFlash: true,
  hasTorch: true,
  supportsFocus: true,
  supportsExposure: true,
  supportsHdr: true,
  supportsLowLight: true,
  minZoom: 0.5,
  maxZoom: 10,
  minExposure: -3,
  maxExposure: 3,
  photoResolutions: [
    { width: 4000, height: 3000 },
    { width: 1920, height: 1080 },
  ],
};

const minimalCamera = {
  id: 'front-fixed',
  name: 'Front Camera',
  position: 'front' as const,
  type: 'wide-angle',
  physicalDeviceCount: 0,
  isVirtual: false,
  hasFlash: false,
  hasTorch: false,
  supportsFocus: false,
  supportsExposure: false,
  supportsHdr: false,
  supportsLowLight: false,
  minZoom: 1,
  maxZoom: 1,
  minExposure: 0,
  maxExposure: 0,
  photoResolutions: [],
};

describe('projectCapabilities', () => {
  it('projects native camera features into serializable diagnostics', () => {
    expect(projectCapabilities(fullCamera)).toMatchObject({
      supportsFlash: true,
      supportsFocus: true,
      supportsExposure: true,
      supportsHdr: true,
      supportsLowLight: true,
      maxPhotoMegapixels: 12,
      zoom: { min: 0.5, max: 10 },
    });
  });

  it('reports absent controls instead of inventing support', () => {
    expect(projectCapabilities(minimalCamera)).toMatchObject({
      supportsFlash: false,
      supportsFocus: false,
      supportsExposure: false,
      supportsHdr: false,
      supportsLowLight: false,
      maxPhotoMegapixels: null,
    });
  });
});

describe('guardSettings', () => {
  it('clamps ranges and disables unsupported capture settings', () => {
    expect(
      guardSettings(minimalCamera, {
        flash: 'on',
        hdr: true,
        lowLight: true,
        zoom: 4,
        exposure: 2,
      }),
    ).toEqual({
      flash: 'off',
      hdr: false,
      lowLight: false,
      zoom: 1,
      exposure: 0,
    });
  });

  it('preserves supported settings inside the native ranges', () => {
    expect(
      guardSettings(fullCamera, {
        flash: 'auto',
        hdr: true,
        lowLight: true,
        zoom: 2,
        exposure: -1,
      }),
    ).toEqual({
      flash: 'auto',
      hdr: true,
      lowLight: true,
      zoom: 2,
      exposure: -1,
    });
  });
});

describe('optionalNativeToggle', () => {
  it('omits unsupported native props instead of passing false', () => {
    expect(optionalNativeToggle(false, false)).toBeUndefined();
    expect(optionalNativeToggle(false, true)).toBeUndefined();
    expect(optionalNativeToggle(true, false)).toBe(false);
    expect(optionalNativeToggle(true, true)).toBe(true);
  });
});

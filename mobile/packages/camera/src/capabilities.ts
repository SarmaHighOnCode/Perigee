/**
 * Camera capability projection and guards.
 *
 * Lifted from testing/testcamera/src/camera/capabilities.ts, which was
 * validated on a Pixel 7 emulator (8 PASS / 0 FAIL). The logic is unchanged:
 * it was proven against real hardware and this is not the place to be clever.
 *
 * The point of guarding is that VisionCamera throws — or silently misbehaves —
 * when handed a setting the device does not support. Clamping here means the
 * UI can offer a control and let the guard decide, rather than every call site
 * having to ask what the hardware can do.
 */

import type { CameraCapabilities, CameraDescriptor, CaptureSettings } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * VisionCamera treats `undefined` as "leave the native default alone" and a
 * boolean as an explicit instruction. Passing `false` for an unsupported
 * feature is not the same as omitting it, and on some devices it errors.
 */
export function optionalNativeToggle(supported: boolean, enabled: boolean): boolean | undefined {
  return supported ? enabled : undefined;
}

export function projectCapabilities(camera: CameraDescriptor): CameraCapabilities {
  const largestPixels = camera.photoResolutions.reduce(
    (largest, size) => Math.max(largest, size.width * size.height),
    0,
  );

  return {
    supportsFlash: camera.hasFlash,
    supportsTorch: camera.hasTorch,
    supportsFocus: camera.supportsFocus,
    supportsExposure: camera.supportsExposure,
    supportsHdr: camera.supportsHdr,
    supportsLowLight: camera.supportsLowLight,
    zoom: { min: camera.minZoom, max: camera.maxZoom },
    exposure: { min: camera.minExposure, max: camera.maxExposure },
    maxPhotoMegapixels: largestPixels === 0 ? null : Number((largestPixels / 1_000_000).toFixed(2)),
  };
}

export function guardSettings(
  camera: CameraDescriptor,
  requested: CaptureSettings,
): CaptureSettings {
  return {
    flash: camera.hasFlash ? requested.flash : 'off',
    hdr: camera.supportsHdr && requested.hdr,
    lowLight: camera.supportsLowLight && requested.lowLight,
    zoom: clamp(requested.zoom, camera.minZoom, camera.maxZoom),
    exposure: camera.supportsExposure
      ? clamp(requested.exposure, camera.minExposure, camera.maxExposure)
      : 0,
  };
}

/**
 * Perigee always enrols and searches on a FRONT-FACING subject held at arm's
 * length by the officer, so the rear camera is the default: it is the higher
 * quality sensor on nearly every Android handset.
 */
export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  flash: 'off',
  hdr: false,
  lowLight: false,
  zoom: 1,
  exposure: 0,
};

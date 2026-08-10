import type {
  CameraCapabilities,
  CameraDescriptor,
  CaptureSettings,
} from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function optionalNativeToggle(
  supported: boolean,
  enabled: boolean,
): boolean | undefined {
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
    maxPhotoMegapixels:
      largestPixels === 0 ? null : Number((largestPixels / 1_000_000).toFixed(2)),
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

/**
 * Camera types.
 *
 * Carried over from testing/testcamera/src/types.ts, narrowed to what Perigee
 * needs. The evidence/diagnostics types from the prototype are deliberately
 * left behind — they belong to the camera lab, not to the field app.
 */

export type CameraPosition = 'front' | 'back' | 'external' | 'unspecified';
export type FlashMode = 'off' | 'on' | 'auto';

export interface Size {
  width: number;
  height: number;
}

export interface CameraDescriptor {
  id: string;
  name: string;
  position: CameraPosition;
  type: string;
  physicalDeviceCount: number;
  isVirtual: boolean;
  hasFlash: boolean;
  hasTorch: boolean;
  supportsFocus: boolean;
  supportsExposure: boolean;
  supportsHdr: boolean;
  supportsLowLight: boolean;
  minZoom: number;
  maxZoom: number;
  minExposure: number;
  maxExposure: number;
  photoResolutions: Size[];
}

export interface CameraCapabilities {
  supportsFlash: boolean;
  supportsTorch: boolean;
  supportsFocus: boolean;
  supportsExposure: boolean;
  supportsHdr: boolean;
  supportsLowLight: boolean;
  zoom: { min: number; max: number };
  exposure: { min: number; max: number };
  maxPhotoMegapixels: number | null;
}

export interface CaptureSettings {
  flash: FlashMode;
  hdr: boolean;
  lowLight: boolean;
  zoom: number;
  exposure: number;
}

/**
 * A capture that has not yet been embedded.
 *
 * IMPORTANT: in Perigee Field this NEVER leaves the device. It is embedded
 * on-device and only the resulting vector is sent. The `uri` exists so the
 * frame can be shown to the officer and then discarded.
 */
export interface CaptureResult {
  uri: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string;
  capturedAt: string;
  latencyMs: number;
}

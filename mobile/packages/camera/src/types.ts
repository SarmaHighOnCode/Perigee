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

export interface MediaInput {
  uri: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  mimeType?: string | null;
  source: 'camera' | 'gallery';
  acquiredAt: string;
}

export interface MediaRecord {
  uri: string;
  width: number | null;
  height: number | null;
  megapixels: number | null;
  bytes: number | null;
  mimeType: string;
  extension: string | null;
  source: 'camera' | 'gallery';
  acquiredAt: string;
}

export interface CameraCaptureEvent {
  media: MediaRecord;
  latencyMs: number;
}

export type CheckStatus = 'PASS' | 'FAIL' | 'UNSUPPORTED' | 'NOT_TESTED';
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

export interface TimingSummary {
  count: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
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

export interface DeviceRecord {
  manufacturer: string;
  model: string;
  osVersion: string;
  apiLevel: number | null;
  physicalDevice: boolean;
}

export interface PermissionRecord {
  camera: string;
  mediaLibrary: string;
}

export interface EvidenceCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface EvidenceInput {
  generatedAt: string;
  device: DeviceRecord;
  permissions: PermissionRecord;
  cameras: CameraDescriptor[];
  selectedCamera: CameraDescriptor | null;
  settings: CaptureSettings | null;
  media: MediaRecord | null;
  captureSamplesMs: number[];
  checks: EvidenceCheck[];
  errors: string[];
}

export interface EvidenceReport extends Omit<EvidenceInput, 'captureSamplesMs'> {
  schemaVersion: 1;
  captureTiming: TimingSummary | null;
  manualComparison: string[];
}

export { PerigeeCamera } from './PerigeeCamera';
export type { PerigeeCameraProps } from './PerigeeCamera';
export {
  DEFAULT_CAPTURE_SETTINGS,
  guardSettings,
  optionalNativeToggle,
  projectCapabilities,
} from './capabilities';
export { canCapture, captureBlockedReason, isCameraActive } from './lifecycle';
export type {
  CameraCapabilities,
  CameraDescriptor,
  CameraPosition,
  CaptureResult,
  CaptureSettings,
  FlashMode,
  Size,
} from './types';

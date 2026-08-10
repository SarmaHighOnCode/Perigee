import type { CheckStatus } from '../types';

export function hasCameraPermission(status: string): boolean {
  return status === 'granted' || status === 'authorized';
}

export function cameraPermissionCheck(status: string): CheckStatus {
  if (hasCameraPermission(status)) return 'PASS';
  if (status === 'not-determined') return 'NOT_TESTED';
  return 'FAIL';
}

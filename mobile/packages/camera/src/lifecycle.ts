/**
 * Camera session lifecycle.
 *
 * Lifted unchanged from testing/testcamera/src/camera/lifecycle.ts.
 *
 * The reason capture requires FOUR conditions rather than one: VisionCamera
 * reports session start and preview start separately, and a capture issued
 * between them fails. Backgrounding the app tears the session down without
 * clearing the flags, so appState has to be checked too. Each condition here
 * was earned by an actual failure on device.
 */

export function isCameraActive(appState: string | null | undefined): boolean {
  return appState === 'active';
}

export function canCapture(
  sessionRunning: boolean,
  previewRunning: boolean,
  appState: string | null | undefined,
  capturing: boolean,
): boolean {
  return sessionRunning && previewRunning && isCameraActive(appState) && !capturing;
}

/**
 * Why the capture button is disabled, for the officer rather than the log.
 * A greyed-out button with no explanation is the single most common complaint
 * about field tools.
 */
export function captureBlockedReason(
  sessionRunning: boolean,
  previewRunning: boolean,
  appState: string | null | undefined,
  capturing: boolean,
): string | null {
  if (capturing) return 'CAPTURING';
  if (!isCameraActive(appState)) return 'APP NOT IN FOREGROUND';
  if (!sessionRunning) return 'STARTING CAMERA SESSION';
  if (!previewRunning) return 'STARTING PREVIEW';
  return null;
}

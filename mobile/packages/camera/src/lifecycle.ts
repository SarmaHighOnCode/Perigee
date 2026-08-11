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

export function captureBlockedReason(
  sessionRunning: boolean, previewRunning: boolean,
  appState: string | null | undefined, capturing: boolean,
): string | null {
  if (capturing) return 'CAPTURING';
  if (!isCameraActive(appState)) return 'APP NOT IN FOREGROUND';
  if (!sessionRunning) return 'STARTING CAMERA SESSION';
  if (!previewRunning) return 'STARTING PREVIEW';
  return null;
}

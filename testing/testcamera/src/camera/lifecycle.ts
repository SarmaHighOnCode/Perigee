export function isCameraActive(appState: string | null | undefined): boolean {
  return appState === 'active';
}

export function canCapture(
  sessionRunning: boolean,
  previewRunning: boolean,
  appState: string | null | undefined,
  capturing: boolean,
): boolean {
  return (
    sessionRunning &&
    previewRunning &&
    isCameraActive(appState) &&
    !capturing
  );
}

export interface AndroidModelDownloadDependencies {
  downloadDirectory: string;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  fetch(
    url: string,
    path: string,
    onProgress: (receivedBytes: number) => void,
  ): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
}

export class AndroidModelDownloadError extends Error {
  readonly primaryError: unknown;
  readonly cleanupError: unknown;

  constructor(primaryError: unknown, cleanupError: unknown) {
    super(
      `${errorMessage(primaryError)} (temporary download cleanup also failed: ${errorMessage(cleanupError)})`,
    );
    this.name = 'AndroidModelDownloadError';
    this.primaryError = primaryError;
    this.cleanupError = cleanupError;
  }
}

let attemptSequence = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextAttemptId(): string {
  attemptSequence = (attemptSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${attemptSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function temporaryDownloadPath(downloadDirectory: string, destination: string): string {
  const destinationKey = destination.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const directory = downloadDirectory.replace(/\/+$/, '');
  return `${directory}/perigee-${destinationKey}-${nextAttemptId()}`;
}

export async function downloadAndroidModel(
  url: string,
  destination: string,
  dependencies: AndroidModelDownloadDependencies,
  onProgress: (receivedBytes: number) => void,
): Promise<void> {
  const temporaryPath = temporaryDownloadPath(
    dependencies.downloadDirectory,
    destination,
  );
  let primaryError: unknown;
  let cleanupError: unknown;
  let failed = false;

  try {
    await dependencies.fetch(url, temporaryPath, onProgress);
    await dependencies.copy(temporaryPath, destination);
  } catch (error) {
    failed = true;
    primaryError = error;
  } finally {
    try {
      if (await dependencies.exists(temporaryPath)) {
        await dependencies.remove(temporaryPath);
      }
    } catch (error) {
      cleanupError = error;
    }
  }

  if (failed) {
    if (cleanupError !== undefined) {
      throw new AndroidModelDownloadError(primaryError, cleanupError);
    }
    throw primaryError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
}

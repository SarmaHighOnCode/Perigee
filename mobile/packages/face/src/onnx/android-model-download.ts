export interface AndroidModelDownloadDependencies {
  readonly downloadDirectory: string;
  readonly registryDirectory: string;
  ensureRegistryDirectory(): Promise<void>;
  listRegistryEntries(): Promise<string[]>;
  register(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  cancelDownload(identity: string): Promise<void>;
  fetch(
    url: string,
    path: string,
    identity: string,
    onProgress: (receivedBytes: number) => void,
  ): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
}

export class AndroidModelCleanupError extends Error {
  readonly errors: readonly unknown[];

  constructor(identity: string, errors: readonly unknown[]) {
    super(
      `Failed to clean tracked Android download ${identity}: ${errors.map(errorMessage).join('; ')}`,
    );
    this.name = 'AndroidModelCleanupError';
    this.errors = errors;
  }
}

export class AndroidModelDownloadError extends Error {
  readonly primaryError: unknown;
  readonly cleanupError: unknown;

  constructor(primaryError: unknown, cleanupError: unknown) {
    super(
      `${errorMessage(primaryError)} (tracked download cleanup also failed: ${errorMessage(cleanupError)})`,
    );
    this.name = 'AndroidModelDownloadError';
    this.primaryError = primaryError;
    this.cleanupError = cleanupError;
  }
}

export interface AndroidModelRecoveryFailure {
  readonly identity: string;
  readonly error: unknown;
}

export class AndroidModelRecoveryError extends Error {
  readonly failures: readonly AndroidModelRecoveryFailure[];

  constructor(failures: readonly AndroidModelRecoveryFailure[]) {
    super(
      `Failed to recover ${failures.length} tracked Android model download(s): ${failures
        .map(({ identity, error }) => `${identity}: ${errorMessage(error)}`)
        .join('; ')}`,
    );
    this.name = 'AndroidModelRecoveryError';
    this.failures = failures;
  }
}

const IDENTITY_PREFIX = 'perigee-model-';
const RECORD_SUFFIX = '.pending';
const PUBLIC_SUFFIX = '.partial';
const VALID_IDENTITY = /^perigee-model-[a-z0-9-]+$/;

let attemptSequence = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function joinedPath(directory: string, name: string): string {
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

function nextIdentity(): string {
  attemptSequence = (attemptSequence + 1) % Number.MAX_SAFE_INTEGER;
  const random = Math.random().toString(36).slice(2) || '0';
  return `${IDENTITY_PREFIX}${Date.now().toString(36)}-${attemptSequence.toString(36)}-${random}`;
}

function identityFromRegistryEntry(entry: string): string | undefined {
  if (!entry.endsWith(RECORD_SUFFIX)) return undefined;
  const identity = entry.slice(0, -RECORD_SUFFIX.length);
  return VALID_IDENTITY.test(identity) ? identity : undefined;
}

async function cleanupTrackedAttempt(
  identity: string,
  dependencies: AndroidModelDownloadDependencies,
): Promise<void> {
  const errors: unknown[] = [];
  const publicPath = joinedPath(
    dependencies.downloadDirectory,
    `${identity}${PUBLIC_SUFFIX}`,
  );
  const recordPath = joinedPath(
    dependencies.registryDirectory,
    `${identity}${RECORD_SUFFIX}`,
  );

  try {
    await dependencies.cancelDownload(identity);
  } catch (error) {
    errors.push(error);
  }

  try {
    if (await dependencies.exists(publicPath)) {
      await dependencies.remove(publicPath);
    }
  } catch (error) {
    errors.push(error);
  }

  if (errors.length === 0) {
    try {
      await dependencies.remove(recordPath);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AndroidModelCleanupError(identity, errors);
  }
}

async function recoverTrackedAttempts(
  dependencies: AndroidModelDownloadDependencies,
): Promise<void> {
  await dependencies.ensureRegistryDirectory();
  const entries = await dependencies.listRegistryEntries();
  const failures: AndroidModelRecoveryFailure[] = [];

  for (const entry of entries) {
    const identity = identityFromRegistryEntry(entry);
    if (identity === undefined) {
      failures.push({
        identity: entry,
        error: new Error('invalid recovery registry entry'),
      });
      continue;
    }

    try {
      await cleanupTrackedAttempt(identity, dependencies);
    } catch (error) {
      failures.push({ identity, error });
    }
  }

  if (failures.length > 0) {
    throw new AndroidModelRecoveryError(failures);
  }
}

export class AndroidModelDownloadManager {
  readonly #dependencies: AndroidModelDownloadDependencies;
  #recovery: Promise<void> | undefined;

  constructor(dependencies: AndroidModelDownloadDependencies) {
    this.#dependencies = dependencies;
  }

  recover(): Promise<void> {
    this.#recovery ??= recoverTrackedAttempts(this.#dependencies);
    return this.#recovery;
  }

  async download(
    url: string,
    destination: string,
    onProgress: (receivedBytes: number) => void,
  ): Promise<void> {
    await this.recover();

    const identity = nextIdentity();
    const publicPath = joinedPath(
      this.#dependencies.downloadDirectory,
      `${identity}${PUBLIC_SUFFIX}`,
    );
    const recordPath = joinedPath(
      this.#dependencies.registryDirectory,
      `${identity}${RECORD_SUFFIX}`,
    );

    await this.#dependencies.register(recordPath);

    let failed = false;
    let primaryError: unknown;
    try {
      await this.#dependencies.fetch(url, publicPath, identity, onProgress);
      await this.#dependencies.copy(publicPath, destination);
    } catch (error) {
      failed = true;
      primaryError = error;
    }

    let cleanupError: unknown;
    try {
      await cleanupTrackedAttempt(identity, this.#dependencies);
    } catch (error) {
      cleanupError = error;
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
}

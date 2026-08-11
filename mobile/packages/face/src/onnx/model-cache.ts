import { modelUrl, type ModelSpec } from './models';

export interface ModelFileAdapter {
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  sha256(path: string): Promise<string>;
  download(url: string, path: string, onProgress: (received: number) => void): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  modelPath(fileName: string): string;
}

export interface ModelProgress {
  key: ModelSpec['key'];
  phase: 'checking' | 'downloading' | 'verifying' | 'ready';
  receivedBytes: number;
  totalBytes: number;
}

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/;
const inFlightModels = new Map<ModelSpec['key'], Promise<string>>();

function assertExpectedDigest(digest: string): void {
  if (!LOWERCASE_SHA256.test(digest)) {
    throw new Error('Expected model SHA-256 must be exactly 64 lowercase hexadecimal characters');
  }
}

function report(
  spec: ModelSpec,
  phase: ModelProgress['phase'],
  receivedBytes: number,
  onProgress?: (progress: ModelProgress) => void,
): void {
  onProgress?.({
    key: spec.key,
    phase,
    receivedBytes,
    totalBytes: spec.bytes,
  });
}

async function removeIfPresent(files: ModelFileAdapter, path: string): Promise<void> {
  if (await files.exists(path)) {
    await files.remove(path);
  }
}

async function cachedModelIsValid(
  spec: ModelSpec,
  path: string,
  files: ModelFileAdapter,
  onProgress?: (progress: ModelProgress) => void,
): Promise<boolean> {
  if ((await files.size(path)) !== spec.bytes) {
    return false;
  }

  report(spec, 'verifying', spec.bytes, onProgress);
  const digest = await files.sha256(path);
  return LOWERCASE_SHA256.test(digest) && digest === spec.sha256;
}

async function verifyDownloadedModel(
  spec: ModelSpec,
  path: string,
  files: ModelFileAdapter,
): Promise<void> {
  const bytes = await files.size(path);
  if (bytes !== spec.bytes) {
    throw new Error(`Model size mismatch for ${spec.fileName}: expected ${spec.bytes}, received ${bytes}`);
  }

  const digest = await files.sha256(path);
  if (!LOWERCASE_SHA256.test(digest)) {
    throw new Error(`Model SHA-256 for ${spec.fileName} is not lowercase 64-character hexadecimal`);
  }
  if (digest !== spec.sha256) {
    throw new Error(`Model SHA-256 digest mismatch for ${spec.fileName}`);
  }
}

async function ensureModelOnce(
  spec: ModelSpec,
  baseUrl: string,
  files: ModelFileAdapter,
  onProgress?: (progress: ModelProgress) => void,
): Promise<string> {
  const target = files.modelPath(spec.fileName);
  const partial = `${target}.partial`;

  report(spec, 'checking', 0, onProgress);
  await removeIfPresent(files, partial);

  if (await files.exists(target)) {
    if (await cachedModelIsValid(spec, target, files, onProgress)) {
      report(spec, 'ready', spec.bytes, onProgress);
      return target;
    }
    await files.remove(target);
  }

  report(spec, 'downloading', 0, onProgress);
  try {
    await files.download(modelUrl(spec, baseUrl), partial, (receivedBytes) => {
      report(spec, 'downloading', receivedBytes, onProgress);
    });
    report(spec, 'verifying', spec.bytes, onProgress);
    await verifyDownloadedModel(spec, partial, files);
    await files.move(partial, target);
  } catch (error) {
    await removeIfPresent(files, partial);
    throw error;
  }

  report(spec, 'ready', spec.bytes, onProgress);
  return target;
}

export async function ensureModel(
  spec: ModelSpec,
  baseUrl: string,
  files: ModelFileAdapter,
  onProgress?: (progress: ModelProgress) => void,
): Promise<string> {
  assertExpectedDigest(spec.sha256);

  const existing = inFlightModels.get(spec.key);
  if (existing) {
    return existing;
  }

  const operation = ensureModelOnce(spec, baseUrl, files, onProgress);
  inFlightModels.set(spec.key, operation);

  try {
    return await operation;
  } finally {
    if (inFlightModels.get(spec.key) === operation) {
      inFlightModels.delete(spec.key);
    }
  }
}

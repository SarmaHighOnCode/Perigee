import { describe, expect, it } from 'vitest';

import { ensureModel, type ModelFileAdapter, type ModelProgress } from '../onnx/model-cache';
import type { ModelSpec } from '../onnx/models';

const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);

const SPEC: ModelSpec = {
  key: 'det_10g',
  fileName: 'det_10g.onnx',
  bytes: 10,
  sha256: DIGEST,
  inputName: 'input.1',
  outputNames: ['448'],
};

interface StoredFile {
  bytes: number;
  sha256: string;
}

class MemoryModelFiles implements ModelFileAdapter {
  readonly files = new Map<string, StoredFile>();
  readonly calls: string[] = [];
  downloadResult: StoredFile = { bytes: SPEC.bytes, sha256: SPEC.sha256 };
  downloadProgress = [SPEC.bytes];
  downloadHook?: (path: string, onProgress: (received: number) => void) => Promise<void>;
  removeHook?: (path: string) => Promise<void>;

  modelPath(fileName: string): string {
    return `/models/${fileName}`;
  }

  async exists(path: string): Promise<boolean> {
    this.calls.push(`exists:${path}`);
    return this.files.has(path);
  }

  async size(path: string): Promise<number> {
    this.calls.push(`size:${path}`);
    return this.requireFile(path).bytes;
  }

  async sha256(path: string): Promise<string> {
    this.calls.push(`sha256:${path}`);
    return this.requireFile(path).sha256;
  }

  async download(
    url: string,
    path: string,
    onProgress: (received: number) => void,
  ): Promise<void> {
    this.calls.push(`download:${url}->${path}`);

    if (this.downloadHook) {
      await this.downloadHook(path, onProgress);
      return;
    }

    for (const received of this.downloadProgress) {
      onProgress(received);
    }
    this.files.set(path, { ...this.downloadResult });
  }

  async move(source: string, destination: string): Promise<void> {
    this.calls.push(`move:${source}->${destination}`);
    const file = this.requireFile(source);
    this.files.set(destination, file);
    this.files.delete(source);
  }

  async remove(path: string): Promise<void> {
    this.calls.push(`remove:${path}`);
    await this.removeHook?.(path);
    this.files.delete(path);
  }

  private requireFile(path: string): StoredFile {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`Missing in-memory file: ${path}`);
    }
    return file;
  }
}

describe('verified model cache', () => {
  it('reuses a cached file only after size and sha256 both match', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    files.files.set(target, { bytes: SPEC.bytes, sha256: SPEC.sha256 });

    await expect(ensureModel(SPEC, 'https://models.example', files)).resolves.toBe(target);

    expect(files.calls).toContain(`size:${target}`);
    expect(files.calls).toContain(`sha256:${target}`);
    expect(files.calls.some((call) => call.startsWith('download:'))).toBe(false);
  });

  it('deletes a corrupt cached file before downloading', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    files.files.set(target, { bytes: SPEC.bytes, sha256: OTHER_DIGEST });

    await ensureModel(SPEC, 'https://models.example/', files);

    const removeIndex = files.calls.indexOf(`remove:${target}`);
    const downloadIndex = files.calls.findIndex((call) => call.startsWith('download:'));
    expect(removeIndex).toBeGreaterThanOrEqual(0);
    expect(downloadIndex).toBeGreaterThan(removeIndex);
    expect(files.files.get(target)).toEqual({ bytes: SPEC.bytes, sha256: SPEC.sha256 });
  });

  it('deletes a wrong-size cached file before downloading even when its digest matches', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    files.files.set(target, { bytes: SPEC.bytes - 1, sha256: SPEC.sha256 });

    await ensureModel(SPEC, 'https://models.example', files);

    const sizeIndex = files.calls.indexOf(`size:${target}`);
    const removeIndex = files.calls.indexOf(`remove:${target}`);
    const downloadIndex = files.calls.findIndex((call) => call.startsWith('download:'));
    expect(sizeIndex).toBeGreaterThanOrEqual(0);
    expect(removeIndex).toBeGreaterThan(sizeIndex);
    expect(downloadIndex).toBeGreaterThan(removeIndex);
    expect(files.calls).not.toContain(`sha256:${target}`);
    expect(files.files.get(target)).toEqual({ bytes: SPEC.bytes, sha256: SPEC.sha256 });
  });

  it('downloads to a partial path and promotes only after verification', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    const partial = `${target}.partial`;

    await expect(ensureModel(SPEC, 'https://models.example/', files)).resolves.toBe(target);

    expect(files.calls).toContain(
      `download:https://models.example/${SPEC.fileName}->${partial}`,
    );
    const sizeIndex = files.calls.indexOf(`size:${partial}`);
    const digestIndex = files.calls.indexOf(`sha256:${partial}`);
    const moveIndex = files.calls.indexOf(`move:${partial}->${target}`);
    expect(sizeIndex).toBeGreaterThanOrEqual(0);
    expect(digestIndex).toBeGreaterThan(sizeIndex);
    expect(moveIndex).toBeGreaterThan(digestIndex);
    expect(files.files.has(partial)).toBe(false);
    expect(files.files.has(target)).toBe(true);
  });

  it('deletes a failed partial after a digest mismatch', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    const partial = `${target}.partial`;
    files.downloadResult = { bytes: SPEC.bytes, sha256: OTHER_DIGEST };

    await expect(ensureModel(SPEC, 'https://models.example', files)).rejects.toThrow(
      /sha-?256|digest/i,
    );

    expect(files.calls).toContain(`remove:${partial}`);
    expect(files.calls).not.toContain(`move:${partial}->${target}`);
    expect(files.files.has(partial)).toBe(false);
    expect(files.files.has(target)).toBe(false);
  });

  it('preserves the initiating download error when partial cleanup also fails', async () => {
    const files = new MemoryModelFiles();
    const primaryError = new Error('native download failed');
    const cleanupError = new Error('private partial unlink failed');
    files.downloadHook = async (path) => {
      files.files.set(path, { bytes: 1, sha256: OTHER_DIGEST });
      throw primaryError;
    };
    files.removeHook = async (path) => {
      if (path.endsWith('.partial')) {
        throw cleanupError;
      }
    };

    const operation = ensureModel(SPEC, 'https://models.example', files);

    await expect(operation).rejects.toMatchObject({
      name: 'ModelCacheCleanupError',
      primaryError,
      cleanupError,
    });
    await expect(operation).rejects.toThrow(/native download failed.*private partial unlink failed/i);
  });

  it('reports bytes received and total bytes', async () => {
    const files = new MemoryModelFiles();
    const progress: ModelProgress[] = [];
    files.downloadProgress = [3, SPEC.bytes];

    await ensureModel(SPEC, 'https://models.example', files, (update) => progress.push(update));

    expect(progress).toEqual([
      { key: SPEC.key, phase: 'checking', receivedBytes: 0, totalBytes: SPEC.bytes },
      { key: SPEC.key, phase: 'downloading', receivedBytes: 0, totalBytes: SPEC.bytes },
      { key: SPEC.key, phase: 'downloading', receivedBytes: 3, totalBytes: SPEC.bytes },
      {
        key: SPEC.key,
        phase: 'downloading',
        receivedBytes: SPEC.bytes,
        totalBytes: SPEC.bytes,
      },
      {
        key: SPEC.key,
        phase: 'verifying',
        receivedBytes: SPEC.bytes,
        totalBytes: SPEC.bytes,
      },
      { key: SPEC.key, phase: 'ready', receivedBytes: SPEC.bytes, totalBytes: SPEC.bytes },
    ]);
  });

  it('reports the measured partial size when verifying a truncated download', async () => {
    const files = new MemoryModelFiles();
    const progress: ModelProgress[] = [];
    files.downloadProgress = [7];
    files.downloadResult = { bytes: 7, sha256: SPEC.sha256 };

    await expect(
      ensureModel(SPEC, 'https://models.example', files, (update) => progress.push(update)),
    ).rejects.toThrow(/size mismatch/i);

    expect(progress.filter((update) => update.phase === 'verifying')).toEqual([
      { key: SPEC.key, phase: 'verifying', receivedBytes: 7, totalBytes: SPEC.bytes },
    ]);
    expect(progress.some((update) => update.phase === 'ready')).toBe(false);
  });

  it('serialises concurrent requests for the same model', async () => {
    const files = new MemoryModelFiles();
    const target = files.modelPath(SPEC.fileName);
    const partial = `${target}.partial`;
    let releaseDownload: (() => void) | undefined;
    let markDownloadStarted: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    const downloadStarted = new Promise<void>((resolve) => {
      markDownloadStarted = resolve;
    });
    files.downloadHook = async (path, onProgress) => {
      markDownloadStarted?.();
      await blocked;
      onProgress(SPEC.bytes);
      files.files.set(path, { bytes: SPEC.bytes, sha256: SPEC.sha256 });
    };

    const first = ensureModel(SPEC, 'https://models.example', files);
    const second = ensureModel(SPEC, 'https://models.example', files);
    await downloadStarted;

    expect(files.calls.filter((call) => call.startsWith('download:'))).toHaveLength(1);
    releaseDownload?.();
    await expect(Promise.all([first, second])).resolves.toEqual([target, target]);
    expect(files.calls.filter((call) => call === `move:${partial}->${target}`)).toHaveLength(1);
  });

  it('allows a retry after a failed in-flight operation', async () => {
    const files = new MemoryModelFiles();
    files.downloadResult = { bytes: SPEC.bytes, sha256: OTHER_DIGEST };

    await expect(ensureModel(SPEC, 'https://models.example', files)).rejects.toThrow();

    files.downloadResult = { bytes: SPEC.bytes, sha256: SPEC.sha256 };
    await expect(ensureModel(SPEC, 'https://models.example', files)).resolves.toBe(
      files.modelPath(SPEC.fileName),
    );
    expect(files.calls.filter((call) => call.startsWith('download:'))).toHaveLength(2);
  });

  it('rejects a non-lowercase expected sha256 before touching storage', async () => {
    const files = new MemoryModelFiles();
    const malformedSpec = { ...SPEC, sha256: 'A'.repeat(64) };

    await expect(
      ensureModel(malformedSpec, 'https://models.example', files),
    ).rejects.toThrow(/lowercase.*sha-?256|sha-?256.*lowercase/i);

    expect(files.calls).toEqual([]);
  });
});

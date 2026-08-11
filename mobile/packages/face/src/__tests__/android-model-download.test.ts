import { describe, expect, it, vi } from 'vitest';

import {
  AndroidModelDownloadError,
  downloadAndroidModel,
  type AndroidModelDownloadDependencies,
} from '../onnx/android-model-download';

interface Harness {
  dependencies: AndroidModelDownloadDependencies;
  files: Set<string>;
  fetchedPaths: string[];
  removedPaths: string[];
}

function harness(): Harness {
  const files = new Set<string>();
  const fetchedPaths: string[] = [];
  const removedPaths: string[] = [];
  return {
    files,
    fetchedPaths,
    removedPaths,
    dependencies: {
      downloadDirectory: '/downloads',
      async exists(path) {
        return files.has(path);
      },
      async remove(path) {
        removedPaths.push(path);
        files.delete(path);
      },
      async fetch(_url, path) {
        fetchedPaths.push(path);
        files.add(path);
      },
      async copy() {},
    },
  };
}

describe('Android native model download', () => {
  it('uses unique temporary paths for concurrent transfers of the same model', async () => {
    const state = harness();
    let releaseDownloads: (() => void) | undefined;
    let markBothStarted: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { releaseDownloads = resolve; });
    const bothStarted = new Promise<void>((resolve) => { markBothStarted = resolve; });
    state.dependencies.fetch = async (_url, path) => {
      state.fetchedPaths.push(path);
      state.files.add(path);
      if (state.fetchedPaths.length === 2) markBothStarted?.();
      await blocked;
    };

    const first = downloadAndroidModel(
      'https://models.example/det_10g.onnx',
      '/data/user/0/com.perigee.field/files/det_10g.onnx.partial',
      state.dependencies,
      () => undefined,
    );
    const second = downloadAndroidModel(
      'https://models.example/det_10g.onnx',
      '/data/user/0/com.perigee.field/files/det_10g.onnx.partial',
      state.dependencies,
      () => undefined,
    );

    await bothStarted;
    expect(state.fetchedPaths).toHaveLength(2);
    expect(new Set(state.fetchedPaths)).toHaveLength(2);
    releaseDownloads?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('cleans its unique temporary file when fetch fails', async () => {
    const state = harness();
    const fetchError = new Error('native fetch failed');
    state.dependencies.fetch = async (_url, path) => {
      state.fetchedPaths.push(path);
      state.files.add(path);
      throw fetchError;
    };

    await expect(downloadAndroidModel(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      state.dependencies,
      () => undefined,
    )).rejects.toBe(fetchError);

    expect(state.removedPaths).toEqual(state.fetchedPaths);
    expect(state.files.size).toBe(0);
  });

  it('cleans its unique temporary file when the private copy fails', async () => {
    const state = harness();
    const copyError = new Error('native copy failed');
    state.dependencies.copy = vi.fn(async () => { throw copyError; });

    await expect(downloadAndroidModel(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      state.dependencies,
      () => undefined,
    )).rejects.toBe(copyError);

    expect(state.removedPaths).toEqual(state.fetchedPaths);
    expect(state.files.size).toBe(0);
  });

  it('preserves the transfer error when cleanup also fails', async () => {
    const state = harness();
    const fetchError = new Error('native fetch failed');
    const cleanupError = new Error('temporary unlink failed');
    state.dependencies.fetch = async (_url, path) => {
      state.fetchedPaths.push(path);
      state.files.add(path);
      throw fetchError;
    };
    state.dependencies.remove = async () => { throw cleanupError; };

    const operation = downloadAndroidModel(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      state.dependencies,
      () => undefined,
    );

    await expect(operation).rejects.toMatchObject({
      name: 'AndroidModelDownloadError',
      primaryError: fetchError,
      cleanupError,
    });
    await expect(operation).rejects.toBeInstanceOf(AndroidModelDownloadError);
  });
});

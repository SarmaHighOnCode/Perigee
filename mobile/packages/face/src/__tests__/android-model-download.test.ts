import { describe, expect, it, vi } from 'vitest';

import {
  AndroidModelDownloadError,
  AndroidModelDownloadManager,
  type AndroidModelDownloadDependencies,
} from '../onnx/android-model-download';

interface Harness {
  dependencies: AndroidModelDownloadDependencies;
  files: Set<string>;
  events: string[];
  fetchedPaths: string[];
}

function harness(initialFiles: readonly string[] = []): Harness {
  const files = new Set(initialFiles);
  const events: string[] = [];
  const fetchedPaths: string[] = [];
  return {
    files,
    events,
    fetchedPaths,
    dependencies: {
      downloadDirectory: '/downloads',
      registryDirectory: '/private/recovery',
      async ensureRegistryDirectory() {
        events.push('ensure-registry');
      },
      async listRegistryEntries() {
        events.push('list-registry');
        return [...files]
          .filter((path) => path.startsWith('/private/recovery/'))
          .map((path) => path.slice('/private/recovery/'.length));
      },
      async register(path) {
        events.push(`register:${path}`);
        files.add(path);
      },
      async exists(path) {
        events.push(`exists:${path}`);
        return files.has(path);
      },
      async remove(path) {
        events.push(`remove:${path}`);
        files.delete(path);
      },
      async cancelDownload(identity) {
        events.push(`cancel:${identity}`);
      },
      async fetch(_url, path, identity) {
        events.push(`fetch:${identity}`);
        fetchedPaths.push(path);
        files.add(path);
      },
      async copy(source, destination) {
        events.push(`copy:${source}->${destination}`);
      },
    },
  };
}

describe('Android native model download recovery', () => {
  it('sweeps a prior-process DownloadManager task and public file before enqueue', async () => {
    const identity = 'perigee-model-old-attempt';
    const record = `/private/recovery/${identity}.pending`;
    const publicFile = `/downloads/${identity}.partial`;
    const state = harness([record, publicFile]);
    const manager = new AndroidModelDownloadManager(state.dependencies);

    await manager.download(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      () => undefined,
    );

    expect(state.events.indexOf(`cancel:${identity}`)).toBeGreaterThan(-1);
    expect(state.events.indexOf(`remove:${publicFile}`)).toBeGreaterThan(
      state.events.indexOf(`cancel:${identity}`),
    );
    expect(state.events.indexOf(`remove:${record}`)).toBeGreaterThan(
      state.events.indexOf(`remove:${publicFile}`),
    );
    expect(state.events.indexOf('list-registry')).toBeLessThan(
      state.events.findIndex((event) => event.startsWith('fetch:')),
    );
    expect(state.files.has(record)).toBe(false);
    expect(state.files.has(publicFile)).toBe(false);
  });

  it('durably registers the identity before DownloadManager enqueue and removes it last', async () => {
    const state = harness();
    const manager = new AndroidModelDownloadManager(state.dependencies);

    await manager.download(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      () => undefined,
    );

    const registerIndex = state.events.findIndex((event) => event.startsWith('register:'));
    const fetchIndex = state.events.findIndex((event) => event.startsWith('fetch:'));
    const copyIndex = state.events.findIndex((event) => event.startsWith('copy:'));
    const cancelIndex = state.events.findIndex((event) => event.startsWith('cancel:'));
    const recordRemovalIndex = state.events.findLastIndex(
      (event) => event.startsWith('remove:/private/recovery/'),
    );
    expect(registerIndex).toBeLessThan(fetchIndex);
    expect(fetchIndex).toBeLessThan(copyIndex);
    expect(copyIndex).toBeLessThan(cancelIndex);
    expect(cancelIndex).toBeLessThan(recordRemovalIndex);
    expect(state.files.size).toBe(0);
  });

  it('uses unique tracked public paths for concurrent transfers', async () => {
    const state = harness();
    let releaseDownloads: (() => void) | undefined;
    let markBothStarted: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { releaseDownloads = resolve; });
    const bothStarted = new Promise<void>((resolve) => { markBothStarted = resolve; });
    state.dependencies.fetch = async (_url, path, identity) => {
      state.events.push(`fetch:${identity}`);
      state.fetchedPaths.push(path);
      state.files.add(path);
      if (state.fetchedPaths.length === 2) markBothStarted?.();
      await blocked;
    };
    const manager = new AndroidModelDownloadManager(state.dependencies);

    const first = manager.download('https://models.example/a', '/private/a.partial', () => undefined);
    const second = manager.download('https://models.example/b', '/private/b.partial', () => undefined);
    await bothStarted;

    expect(new Set(state.fetchedPaths)).toHaveLength(2);
    releaseDownloads?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(state.files.size).toBe(0);
  });

  it('keeps the recovery record when restart cancellation fails', async () => {
    const identity = 'perigee-model-old-attempt';
    const record = `/private/recovery/${identity}.pending`;
    const state = harness([record]);
    const cancelError = new Error('native cancellation failed');
    state.dependencies.cancelDownload = vi.fn(async () => { throw cancelError; });
    const manager = new AndroidModelDownloadManager(state.dependencies);

    await expect(manager.download(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      () => undefined,
    )).rejects.toMatchObject({
      name: 'AndroidModelRecoveryError',
      failures: expect.arrayContaining([expect.objectContaining({
        identity,
        error: expect.objectContaining({ errors: expect.arrayContaining([cancelError]) }),
      })]),
    });

    expect(state.files.has(record)).toBe(true);
    expect(state.fetchedPaths).toEqual([]);
  });

  it('preserves the transfer error when tracked cleanup also fails', async () => {
    const state = harness();
    const fetchError = new Error('native fetch failed');
    const cleanupError = new Error('native cancellation failed');
    state.dependencies.fetch = async (_url, path) => {
      state.files.add(path);
      throw fetchError;
    };
    state.dependencies.cancelDownload = async () => { throw cleanupError; };
    const manager = new AndroidModelDownloadManager(state.dependencies);

    const operation = manager.download(
      'https://models.example/det_10g.onnx',
      '/private/det_10g.onnx.partial',
      () => undefined,
    );

    await expect(operation).rejects.toMatchObject({
      name: 'AndroidModelDownloadError',
      primaryError: fetchError,
      cleanupError: expect.objectContaining({ errors: expect.arrayContaining([cleanupError]) }),
    });
    await expect(operation).rejects.toBeInstanceOf(AndroidModelDownloadError);
    expect([...state.files].some((path) => path.endsWith('.pending'))).toBe(true);
  });
});

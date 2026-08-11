import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelFileAdapter } from '../onnx/model-cache';

const native = vi.hoisted(() => {
  const progress = vi.fn((callback: (receivedBytes: string) => void) => {
    callback('7');
    return Promise.resolve();
  });
  const fetch = vi.fn((_method: string, _url: string) => ({ progress }));
  const config = vi.fn((_options: unknown) => ({ fetch }));

  return {
    config,
    cancelDownloadManagerTask: vi.fn(async (_identity: string) => undefined),
    copy: vi.fn(async (_source: string, _destination: string) => undefined),
    exists: vi.fn(async (_path: string) => false),
    fetch,
    hash: vi.fn(async (_path: string, _algorithm: string) => ''),
    move: vi.fn(async (_source: string, _destination: string) => undefined),
    mkdir: vi.fn(async (_path: string) => true),
    list: vi.fn(async (_path: string) => [] as string[]),
    progress,
    stat: vi.fn(async (_path: string) => ({ size: '0' })),
    unlink: vi.fn(async (_path: string) => undefined),
    writeFile: vi.fn(async (_path: string, _data: string, _encoding: string) => 1),
  };
});

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react-native-blob-util', () => ({
  default: {
    cancelDownloadManagerTask: native.cancelDownloadManagerTask,
    config: native.config,
    fs: {
      dirs: {
        DocumentDir: '/data/user/0/com.perigee.field/files',
        DownloadDir: '/storage/emulated/0/Download',
      },
      cp: native.copy,
      exists: native.exists,
      hash: native.hash,
      mv: native.move,
      mkdir: native.mkdir,
      ls: native.list,
      stat: native.stat,
      unlink: native.unlink,
      writeFile: native.writeFile,
    },
  },
}));

const BLOB_UTIL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../node_modules/react-native-blob-util',
);

let nativeModelFiles: ModelFileAdapter;

describe('native model file adapter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ nativeModelFiles } = await import('../onnx/native-model-files'));
  });

  it('runs restart recovery on the first cache lookup even when no download is needed', async () => {
    await nativeModelFiles.exists('/data/user/0/com.perigee.field/files/det_10g.onnx');

    expect(native.list).toHaveBeenCalledWith(
      '/data/user/0/com.perigee.field/files/.perigee-model-downloads',
    );
  });

  it('uses a tracked DownloadManager file and copies it natively into the private partial path', async () => {
    const onProgress = vi.fn();
    const destination = '/data/user/0/com.perigee.field/files/det_10g.onnx.partial';

    await nativeModelFiles.download(
      'http://127.0.0.1:8765/det_10g.onnx',
      destination,
      onProgress,
    );

    expect(native.writeFile).toHaveBeenCalledOnce();
    expect(native.config).toHaveBeenCalledExactlyOnceWith({
      addAndroidDownloads: expect.objectContaining({
        useDownloadManager: true,
        notification: false,
        mime: 'application/octet-stream',
        path: expect.stringMatching(/^\/storage\/emulated\/0\/Download\/perigee-model-.+\.partial$/),
        title: expect.stringMatching(/^perigee-model-/),
      }),
    });
    expect(native.fetch).toHaveBeenCalledExactlyOnceWith(
      'GET',
      'http://127.0.0.1:8765/det_10g.onnx',
    );
    expect(onProgress).toHaveBeenCalledWith(7);
    expect(native.copy).toHaveBeenCalledWith(
      expect.stringMatching(/^\/storage\/emulated\/0\/Download\/perigee-model-.+\.partial$/),
      destination,
    );
    expect(native.cancelDownloadManagerTask).toHaveBeenCalledOnce();
  });

  it('installs restart-safe native DownloadManager cancellation by durable title identity', () => {
    const indexSource = readFileSync(resolve(BLOB_UTIL_ROOT, 'index.js'), 'utf8');
    const nativeSource = readFileSync(
      resolve(
        BLOB_UTIL_ROOT,
        'android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilReq.java',
      ),
      'utf8',
    );

    expect(indexSource).toContain('cancelDownloadManagerTask');
    expect(nativeSource).toContain('removeDownloadManagerTasksByTitle(taskId)');
    expect(nativeSource).toContain('DownloadManager.COLUMN_TITLE');
    expect(nativeSource).toContain('DownloadManager.COLUMN_ID');
    expect(nativeSource).toContain('dm.remove(id.longValue())');
  });
});

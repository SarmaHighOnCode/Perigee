import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';

import { downloadAndroidModel } from './android-model-download';
import type { ModelFileAdapter } from './model-cache';

export const nativeModelFiles: ModelFileAdapter = {
  exists(path) {
    return ReactNativeBlobUtil.fs.exists(path);
  },

  async size(path) {
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size);
  },

  sha256(path) {
    return ReactNativeBlobUtil.fs.hash(path, 'sha256');
  },

  async download(url, path, onProgress) {
    if (Platform.OS !== 'android') {
      const request = ReactNativeBlobUtil.config({ path, overwrite: true })
        .fetch('GET', url)
        .progress((received) => onProgress(Number(received)));
      await request;
      return;
    }

    await downloadAndroidModel(
      url,
      path,
      {
        downloadDirectory: ReactNativeBlobUtil.fs.dirs.DownloadDir,
        exists: (temporaryPath) => ReactNativeBlobUtil.fs.exists(temporaryPath),
        remove: async (temporaryPath) => {
          await ReactNativeBlobUtil.fs.unlink(temporaryPath);
        },
        fetch: async (downloadUrl, temporaryPath, reportProgress) => {
          const request = ReactNativeBlobUtil.config({
            addAndroidDownloads: {
              useDownloadManager: true,
              notification: false,
              mime: 'application/octet-stream',
              path: temporaryPath,
            },
          })
            .fetch('GET', downloadUrl)
            .progress((received) => reportProgress(Number(received)));
          await request;
        },
        copy: async (source, destination) => {
          await ReactNativeBlobUtil.fs.cp(source, destination);
        },
      },
      onProgress,
    );
  },

  async move(source, destination) {
    await ReactNativeBlobUtil.fs.mv(source, destination);
  },

  async remove(path) {
    await ReactNativeBlobUtil.fs.unlink(path);
  },

  modelPath(fileName) {
    return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${fileName}`;
  },
};

import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';

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

    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const downloadPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/perigee-${fileName}`;
    if (await ReactNativeBlobUtil.fs.exists(downloadPath)) {
      await ReactNativeBlobUtil.fs.unlink(downloadPath);
    }
    try {
      const request = ReactNativeBlobUtil.config({
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: false,
          mime: 'application/octet-stream',
          path: downloadPath,
        },
      })
        .fetch('GET', url)
        .progress((received) => onProgress(Number(received)));
      await request;
      await ReactNativeBlobUtil.fs.cp(downloadPath, path);
      await ReactNativeBlobUtil.fs.unlink(downloadPath);
    } catch (error) {
      if (await ReactNativeBlobUtil.fs.exists(downloadPath)) {
        await ReactNativeBlobUtil.fs.unlink(downloadPath);
      }
      throw error;
    }
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

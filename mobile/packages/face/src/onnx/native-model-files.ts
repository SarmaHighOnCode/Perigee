import ReactNativeBlobUtil from 'react-native-blob-util';

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
    const request = ReactNativeBlobUtil.config({ path, overwrite: true })
      .fetch('GET', url)
      .progress((received) => onProgress(Number(received)));
    await request;
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

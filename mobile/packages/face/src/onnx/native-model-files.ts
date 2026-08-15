import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';

import { AndroidModelDownloadManager } from './android-model-download';
import type { ModelFileAdapter } from './model-cache';

const registryDirectory = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/.perigee-model-downloads`;

const androidDownloads = new AndroidModelDownloadManager({
  downloadDirectory: ReactNativeBlobUtil.fs.dirs.DownloadDir,
  registryDirectory,
  async ensureRegistryDirectory() {
    if (!(await ReactNativeBlobUtil.fs.exists(registryDirectory))) {
      await ReactNativeBlobUtil.fs.mkdir(registryDirectory);
    }
  },
  listRegistryEntries() {
    return ReactNativeBlobUtil.fs.ls(registryDirectory);
  },
  async register(path) {
    await ReactNativeBlobUtil.fs.writeFile(path, 'pending', 'utf8');
  },
  exists(path) {
    return ReactNativeBlobUtil.fs.exists(path);
  },
  async remove(path) {
    await ReactNativeBlobUtil.fs.unlink(path);
  },
  cancelDownload(identity) {
    return ReactNativeBlobUtil.cancelDownloadManagerTask(identity);
  },
  async fetch(url, path, identity, onProgress) {
    const request = ReactNativeBlobUtil.config({
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: false,
        mediaScannable: false,
        mime: 'application/octet-stream',
        path,
        title: identity,
      },
    })
      .fetch('GET', url)
      .progress((received) => onProgress(Number(received)));
    await request;
  },
  async copy(source, destination) {
    await ReactNativeBlobUtil.fs.cp(source, destination);
  },
});

export const nativeModelFiles: ModelFileAdapter = {
  async exists(path) {
    if (Platform.OS === 'android') {
      await androidDownloads.recover();
    }
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
    if (Platform.OS === 'android') {
      await androidDownloads.download(url, path, onProgress);
      return;
    }

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

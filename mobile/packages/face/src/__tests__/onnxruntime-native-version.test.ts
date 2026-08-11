import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const BUILD_GRADLE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../node_modules/onnxruntime-react-native/android/build.gradle',
);

describe('onnxruntime-react-native Android dependency patch', () => {
  it('pins every ONNX Runtime Android selector to a compatible exact version', () => {
    const buildGradle = readFileSync(BUILD_GRADLE_PATH, 'utf8');
    const selectors = [...buildGradle.matchAll(
      /com\.microsoft\.onnxruntime:([\w-]+):([^"']+)/g,
    )].map((match) => `${match[1]}:${match[2]}`);

    expect(selectors).toEqual([
      'onnxruntime-android-qnn:1.24.3@aar',
      'onnxruntime-android:1.24.3@aar',
      'onnxruntime-extensions-android:0.13.0@aar',
    ]);
    expect(selectors.some((selector) => /latest|integration|\+/.test(selector))).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MODEL_BASE_URL,
  DETECTOR,
  MODEL_ID,
  RECOGNISER,
  modelBaseUrl,
  modelUrl,
  type ModelSpec,
} from '../onnx/models';

afterEach(() => {
  vi.unstubAllEnvs();
});

function assertModelSpecPropertiesAreReadonly(spec: ModelSpec): void {
  // @ts-expect-error Model registry keys are immutable.
  spec.key = 'w600k_r50';
  // @ts-expect-error Model filenames are immutable.
  spec.fileName = 'replacement.onnx';
  // @ts-expect-error Model byte counts are immutable.
  spec.bytes = 0;
  // @ts-expect-error Model digests are immutable.
  spec.sha256 = '0'.repeat(64);
  // @ts-expect-error Model input names are immutable.
  spec.inputName = 'input.1';
  // @ts-expect-error Model output arrays cannot be replaced.
  spec.outputNames = [];
}

void assertModelSpecPropertiesAreReadonly;

describe('verified InsightFace model registry', () => {
  it('pins the verified SCRFD detector contract', () => {
    expect(DETECTOR).toEqual({
      key: 'det_10g',
      fileName: 'det_10g.onnx',
      bytes: 16_923_827,
      sha256: '5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91',
      inputName: 'input.1',
      outputNames: ['448', '471', '494', '451', '474', '497', '454', '477', '500'],
    });
    expect(DETECTOR.inputName).toBe('input.1');
    expect(DETECTOR.outputNames).toEqual(['448', '471', '494', '451', '474', '497', '454', '477', '500']);
  });

  it('pins the verified ArcFace recogniser contract and model identity', () => {
    expect(RECOGNISER).toEqual({
      key: 'w600k_r50',
      fileName: 'w600k_r50.onnx',
      bytes: 174_383_860,
      sha256: '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43',
      inputName: 'input.1',
      outputNames: ['683'],
    });
    expect(RECOGNISER.outputNames).toEqual(['683']);
    expect(RECOGNISER.sha256).toBe('4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43');
    expect(MODEL_ID).toBe('insightface/w600k_r50@1');
  });

  it('uses the emulator URL only when the Expo public override is unset', () => {
    vi.stubEnv('EXPO_PUBLIC_MODEL_BASE_URL', undefined);

    expect(modelBaseUrl()).toBe(DEFAULT_MODEL_BASE_URL);
    expect(modelUrl(DETECTOR)).toBe('http://10.0.2.2:8765/det_10g.onnx');
  });

  it('trims and validates the Expo public URL override', () => {
    vi.stubEnv('EXPO_PUBLIC_MODEL_BASE_URL', '  http://127.0.0.1:8765/  ');
    expect(modelBaseUrl()).toBe('http://127.0.0.1:8765');
    expect(modelUrl(RECOGNISER)).toBe('http://127.0.0.1:8765/w600k_r50.onnx');

    vi.stubEnv('EXPO_PUBLIC_MODEL_BASE_URL', '   ');
    expect(() => modelBaseUrl()).toThrow(/EXPO_PUBLIC_MODEL_BASE_URL.*non-empty/i);

    vi.stubEnv('EXPO_PUBLIC_MODEL_BASE_URL', 'file:///tmp/models');
    expect(() => modelBaseUrl()).toThrow(/EXPO_PUBLIC_MODEL_BASE_URL.*http/i);
  });

  it('uses the direct Expo-inlinable process.env member expression in source', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../onnx/models.ts'),
      'utf8',
    );

    expect(source).toMatch(/\bprocess\.env\.EXPO_PUBLIC_MODEL_BASE_URL\b/);
    expect(source).not.toMatch(/globalThis[\s\S]{0,160}EXPO_PUBLIC_MODEL_BASE_URL/);
  });

  it('freezes both model specifications and their nested output arrays', () => {
    expect(Object.isFrozen(DETECTOR)).toBe(true);
    expect(Object.isFrozen(DETECTOR.outputNames)).toBe(true);
    expect(Object.isFrozen(RECOGNISER)).toBe(true);
    expect(Object.isFrozen(RECOGNISER.outputNames)).toBe(true);

    expect(() => {
      (DETECTOR as unknown as { fileName: string }).fileName = 'replacement.onnx';
    }).toThrow(TypeError);
    expect(() => {
      (RECOGNISER.outputNames as unknown as string[]).push('replacement');
    }).toThrow(TypeError);
  });

  it('accepts an explicit model URL base without a duplicate separator', () => {
    expect(modelUrl(DETECTOR, 'http://10.0.2.2:8765')).toBe('http://10.0.2.2:8765/det_10g.onnx');
    expect(modelUrl(RECOGNISER, 'http://10.0.2.2:8765/')).toBe('http://10.0.2.2:8765/w600k_r50.onnx');
  });
});

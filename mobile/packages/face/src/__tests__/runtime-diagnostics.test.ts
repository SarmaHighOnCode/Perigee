import { describe, expect, it, vi } from 'vitest';

import {
  diagnoseRuntimeWithDependencies,
  type RuntimeDiagnosticDependencies,
  type RuntimeSession,
} from '../onnx/runtime-diagnostics';
import type { ModelFileAdapter } from '../onnx/model-cache';
import { DETECTOR, RECOGNISER } from '../onnx/models';

function session(
  inputNames: readonly string[],
  outputNames: readonly string[],
  release: () => Promise<void> = async () => undefined,
): RuntimeSession {
  return { inputNames, outputNames, release };
}

function dependencies(
  create: RuntimeDiagnosticDependencies['loadOnnxRuntime'] extends () => Promise<infer Module>
    ? Module extends { InferenceSession: { create: infer Create } }
      ? Create
      : never
    : never,
): RuntimeDiagnosticDependencies {
  return {
    loadOnnxRuntime: async () => ({ InferenceSession: { create } }),
    loadSkia: async () => ({ Skia: {} }),
    ensureModel: async (spec) => `/models/${spec.fileName}`,
    files: {} as ModelFileAdapter,
  };
}

describe('native runtime diagnostics', () => {
  it('opens both verified models on CPU and reports discovered metadata', async () => {
    const released: string[] = [];
    const create = vi.fn(async (path: string, options: { executionProviders: readonly ['cpu'] }) => {
      if (path.endsWith(DETECTOR.fileName)) {
        return session([DETECTOR.inputName], DETECTOR.outputNames, async () => {
          released.push('detector');
        });
      }
      return session([RECOGNISER.inputName], RECOGNISER.outputNames, async () => {
        released.push('recogniser');
      });
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create),
    );

    expect(create).toHaveBeenNthCalledWith(1, `/models/${DETECTOR.fileName}`, {
      executionProviders: ['cpu'],
    });
    expect(create).toHaveBeenNthCalledWith(2, `/models/${RECOGNISER.fileName}`, {
      executionProviders: ['cpu'],
    });
    expect(result).toEqual({
      onnxRuntimeLoaded: true,
      skiaLoaded: true,
      detectorReady: true,
      recogniserReady: true,
      modelId: 'insightface/w600k_r50@1',
      detectorInputs: ['input.1'],
      detectorOutputs: [...DETECTOR.outputNames],
      recogniserInputs: ['input.1'],
      recogniserOutputs: [...RECOGNISER.outputNames],
      failures: [],
    });
    expect(released).toEqual(['detector', 'recogniser']);
  });

  it('keeps exact metadata mismatches visible and releases the session', async () => {
    const release = vi.fn(async () => undefined);
    const create = vi.fn(async (path: string) =>
      path.endsWith(DETECTOR.fileName)
        ? session(['wrong-input'], ['wrong-output'], release)
        : session([RECOGNISER.inputName], RECOGNISER.outputNames),
    );

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create),
    );

    expect(result.detectorReady).toBe(false);
    expect(result.detectorInputs).toEqual(['wrong-input']);
    expect(result.detectorOutputs).toEqual(['wrong-output']);
    expect(result.failures).toContain(
      'Detector input names mismatch: expected [input.1], received [wrong-input].',
    );
    expect(result.failures).toContain(
      `Detector output names mismatch: expected [${DETECTOR.outputNames.join(', ')}], received [wrong-output].`,
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases an opened detector when recogniser session creation fails', async () => {
    const detectorRelease = vi.fn(async () => undefined);
    const create = vi.fn(async (path: string) => {
      if (path.endsWith(DETECTOR.fileName)) {
        return session([DETECTOR.inputName], DETECTOR.outputNames, detectorRelease);
      }
      throw new Error('native session refused the model');
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create),
    );

    expect(result.detectorReady).toBe(true);
    expect(result.recogniserReady).toBe(false);
    expect(result.failures).toContain(
      'Recogniser session failed: native session refused the model',
    );
    expect(detectorRelease).toHaveBeenCalledOnce();
  });

  it('reports native module load failures without attempting model access', async () => {
    const ensureModel = vi.fn<RuntimeDiagnosticDependencies['ensureModel']>();
    const deps: RuntimeDiagnosticDependencies = {
      loadOnnxRuntime: async () => {
        throw new Error('native binding unavailable');
      },
      loadSkia: async () => {
        throw new Error('Skia JSI unavailable');
      },
      ensureModel,
      files: {} as ModelFileAdapter,
    };

    const result = await diagnoseRuntimeWithDependencies('https://models.example', deps);

    expect(result.onnxRuntimeLoaded).toBe(false);
    expect(result.skiaLoaded).toBe(false);
    expect(result.failures).toEqual([
      'ONNX Runtime load failed: native binding unavailable',
      'Skia load failed: Skia JSI unavailable',
    ]);
    expect(ensureModel).not.toHaveBeenCalled();
  });
});

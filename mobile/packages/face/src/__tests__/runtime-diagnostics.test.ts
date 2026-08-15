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
  events?: string[],
): RuntimeDiagnosticDependencies {
  return {
    loadOnnxRuntime: async () => ({ InferenceSession: { create } }),
    loadSkia: async () => ({ Skia: {} }),
    ensureModel: async (spec) => {
      events?.push(`ensure:${spec.key}`);
      return `/models/${spec.fileName}`;
    },
    files: {} as ModelFileAdapter,
  };
}

describe('native runtime diagnostics', () => {
  it('opens both verified models on CPU and reports discovered metadata', async () => {
    const events: string[] = [];
    let detectorLive = false;
    const create = vi.fn(async (path: string, options: { executionProviders: readonly ['cpu'] }) => {
      if (path.endsWith(DETECTOR.fileName)) {
        events.push('create:detector');
        detectorLive = true;
        return session([DETECTOR.inputName], DETECTOR.outputNames, async () => {
          events.push('release:detector');
          detectorLive = false;
        });
      }
      events.push(`create:recogniser:detector-live=${detectorLive}`);
      return session([RECOGNISER.inputName], RECOGNISER.outputNames, async () => {
        events.push('release:recogniser');
      });
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create, events),
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
    expect(events).toEqual([
      'ensure:det_10g',
      'ensure:w600k_r50',
      'create:detector',
      'create:recogniser:detector-live=true',
      'release:recogniser',
      'release:detector',
    ]);
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
    const events: string[] = [];
    const detectorRelease = vi.fn(async () => undefined);
    const create = vi.fn(async (path: string) => {
      if (path.endsWith(DETECTOR.fileName)) {
        events.push('create:detector');
        return session([DETECTOR.inputName], DETECTOR.outputNames, async () => {
          events.push('release:detector');
          await detectorRelease();
        });
      }
      events.push('create:recogniser');
      throw new Error('native session refused the model');
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create, events),
    );

    expect(result.detectorReady).toBe(true);
    expect(result.recogniserReady).toBe(false);
    expect(result.failures).toContain(
      'Recogniser session failed: native session refused the model',
    );
    expect(detectorRelease).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'ensure:det_10g',
      'ensure:w600k_r50',
      'create:detector',
      'create:recogniser',
      'release:detector',
    ]);
  });

  it('continues with the recogniser and releases it when detector creation fails', async () => {
    const recogniserRelease = vi.fn(async () => undefined);
    const create = vi.fn(async (path: string) => {
      if (path.endsWith(DETECTOR.fileName)) {
        throw new Error('detector session refused the model');
      }
      return session(
        [RECOGNISER.inputName],
        RECOGNISER.outputNames,
        recogniserRelease,
      );
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create),
    );

    expect(result.detectorReady).toBe(false);
    expect(result.recogniserReady).toBe(true);
    expect(result.failures).toContain(
      'Detector session failed: detector session refused the model',
    );
    expect(recogniserRelease).toHaveBeenCalledOnce();
  });

  it('attempts both releases in reverse order and preserves both release failures', async () => {
    const events: string[] = [];
    const create = vi.fn(async (path: string) => {
      if (path.endsWith(DETECTOR.fileName)) {
        return session([DETECTOR.inputName], DETECTOR.outputNames, async () => {
          events.push('release:detector');
          throw new Error('detector release failed natively');
        });
      }
      return session([RECOGNISER.inputName], RECOGNISER.outputNames, async () => {
        events.push('release:recogniser');
        throw new Error('recogniser release failed natively');
      });
    });

    const result = await diagnoseRuntimeWithDependencies(
      'https://models.example',
      dependencies(create),
    );

    expect(events).toEqual(['release:recogniser', 'release:detector']);
    expect(result.detectorReady).toBe(false);
    expect(result.recogniserReady).toBe(false);
    expect(result.failures).toEqual([
      'Recogniser session release failed: recogniser release failed natively',
      'Detector session release failed: detector release failed natively',
    ]);
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

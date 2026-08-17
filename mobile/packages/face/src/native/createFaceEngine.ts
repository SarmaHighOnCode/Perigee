import { createFixtureEngine, type FixtureEngineOptions } from '../fixture-engine';
import { createOnnxFaceEngine, type OnnxFaceEngineOptions } from '../onnx/engine';
import { modelBaseUrl } from '../onnx/models';
import type { FaceEngine } from '../types';
import { createSkiaImageCodec } from './decodeImage';

export interface DiagnosticFixtureEngine extends FaceEngine {
  readonly diagnosticOnly: true;
}

export function createDiagnosticFixtureEngine(
  options: FixtureEngineOptions = {},
): DiagnosticFixtureEngine {
  const engine = createFixtureEngine(options);
  return Object.assign(engine, { diagnosticOnly: true as const });
}

export function createFaceEngine(options: OnnxFaceEngineOptions = {}): FaceEngine {
  return createOnnxFaceEngine({
    baseUrl: options.baseUrl ?? modelBaseUrl(),
    codec: options.codec ?? createSkiaImageCodec(),
    ...options,
  });
}

import { describe, expect, it } from 'vitest';

import { createDiagnosticFixtureEngine, createFaceEngine } from '../native/createFaceEngine';
import { MODEL_ID } from '../onnx/models';

describe('createFaceEngine and createDiagnosticFixtureEngine', () => {
  it('creates diagnostic fixture engine with diagnosticOnly flag', () => {
    const engine = createDiagnosticFixtureEngine();
    expect(engine.diagnosticOnly).toBe(true);
    expect(engine.modelId).toBe(MODEL_ID);
    expect(engine.provider).toBe('fixture');
  });

  it('creates face engine targeting MODEL_ID', () => {
    const engine = createFaceEngine({
      detectorPath: '/mock/det_10g.onnx',
      recogniserPath: '/mock/w600k_r50.onnx',
    });
    expect(engine.modelId).toBe(MODEL_ID);
  });
});

import { describe, expect, it } from 'vitest';

import { createFixtureEngine } from '../fixture-engine';
import { MODEL_ID } from '../onnx/models';
import { runSelfTest } from '../selftest';

describe('runSelfTest', () => {
  it('passes on a valid FaceEngine and reports required metrics', async () => {
    const engine = createFixtureEngine();
    const report = await runSelfTest(engine);

    expect(report.passed).toBe(true);
    expect(report.modelId).toBe(MODEL_ID);
    expect(report.pairsTested).toBe(20);
    expect(report.sameIdentityMin).toBeGreaterThan(0.55);
    expect(report.crossIdentityMax).toBeLessThan(0.3);
    expect(report.p50LatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.p95LatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.failures).toEqual([]);
  });
});

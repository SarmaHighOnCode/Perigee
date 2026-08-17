import { describe, expect, it, vi } from 'vitest';

import { fixtureVector } from '../fixture-engine';
import { MODEL_ID } from '../onnx/models';
import { l2Normalise } from '../onnx/tensor';
import { P95_LATENCY_BUDGET_MS, runSelfTest, type SelfTestPair } from '../selftest';
import type { EmbedResult, FaceEngine, QualityReport } from '../types';

const QUALITY: QualityReport = {
  score: 0.9,
  detScore: 0.9,
  blur: 120,
  yaw: 2,
  pitch: 1,
  facePx: 220,
};

/**
 * A stand-in for the real engine that returns a vector chosen by URI, so a test
 * can stage a specific same/cross-identity outcome. It records every embed, so
 * the tests below can assert that the harness actually reached the model —
 * which is the property that was missing.
 */
function engineReturning(vectors: Record<string, Float32Array>, latencyMs = 20): FaceEngine & {
  embedded: string[];
} {
  const embedded: string[] = [];
  const engine = {
    embedded,
    modelId: MODEL_ID,
    provider: 'cpu',
    init: vi.fn(async () => ({ initMs: 5, provider: 'cpu', modelId: MODEL_ID })),
    embed: vi.fn(async ({ uri }: { uri?: string }): Promise<EmbedResult> => {
      embedded.push(uri ?? '');
      const embedding = vectors[uri ?? ''];
      if (!embedding) throw new Error(`no staged vector for ${uri}`);
      return { embedding, modelId: MODEL_ID, quality: QUALITY, latencyMs };
    }),
    assessQuality: () => QUALITY,
    selfTest: async () => {
      throw new Error('not used');
    },
  } as unknown as FaceEngine & { embedded: string[] };
  return engine;
}

/** Two vectors at a controlled cosine, both L2-normalised. */
function pairAt(seed: number, weightB: number): [Float32Array, Float32Array] {
  const a = fixtureVector(seed);
  const b = fixtureVector(seed + 7919);
  const mixed = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    mixed[i] = (a[i] ?? 0) + weightB * (b[i] ?? 0);
  }
  return [a, l2Normalise(mixed)];
}

describe('runSelfTest', () => {
  it('FAILS when no pairs are supplied, because the engine was never exercised', async () => {
    const engine = engineReturning({});

    const report = await runSelfTest(engine);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('never exercised');
    expect(report.pairsTested).toBe(0);
    expect(engine.embedded).toEqual([]);
  });

  it('embeds every image through the engine rather than computing vectors itself', async () => {
    const [sameA, sameB] = pairAt(11, 0.35); // high cosine
    const [crossA, crossB] = pairAt(22, 40); // near-orthogonal
    const engine = engineReturning({
      'id1_a.jpg': sameA,
      'id1_b.jpg': sameB,
      'id2_a.jpg': crossA,
      'id2_b.jpg': crossB,
    });
    const pairs: SelfTestPair[] = [
      { a: 'id1_a.jpg', b: 'id1_b.jpg', sameIdentity: true },
      { a: 'id2_a.jpg', b: 'id2_b.jpg', sameIdentity: false },
    ];

    const report = await runSelfTest(engine, pairs);

    // The guarantee: four images in, four embeds out.
    expect(engine.embedded).toEqual(['id1_a.jpg', 'id1_b.jpg', 'id2_a.jpg', 'id2_b.jpg']);
    expect(report.pairsTested).toBe(4);
    expect(report.passed).toBe(true);
  });

  it('reports latency measured from the engine, not a constant', async () => {
    const [a, b] = pairAt(33, 0.3);
    const [c, d] = pairAt(44, 40);
    const engine = engineReturning(
      { a: a, b: b, c: c, d: d },
      137, // the engine's own figure
    );

    const report = await runSelfTest(engine, [
      { a: 'a', b: 'b', sameIdentity: true },
      { a: 'c', b: 'd', sameIdentity: false },
    ]);

    expect(report.p50LatencyMs).toBe(137);
    expect(report.p95LatencyMs).toBe(137);
  });

  it('fails the gate when p95 latency exceeds the budget', async () => {
    const [a, b] = pairAt(55, 0.3);
    const [c, d] = pairAt(66, 40);
    const engine = engineReturning(
      { a: a, b: b, c: c, d: d },
      P95_LATENCY_BUDGET_MS + 1,
    );

    const report = await runSelfTest(engine, [
      { a: 'a', b: 'b', sameIdentity: true },
      { a: 'c', b: 'd', sameIdentity: false },
    ]);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('p95 latency');
  });

  it('fails when the model cannot separate two images of one identity', async () => {
    const [a, b] = pairAt(77, 40); // deliberately far apart
    const [c, d] = pairAt(88, 40);
    const engine = engineReturning({ a: a, b: b, c: c, d: d });

    const report = await runSelfTest(engine, [
      { a: 'a', b: 'b', sameIdentity: true },
      { a: 'c', b: 'd', sameIdentity: false },
    ]);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('same-identity cosine');
  });

  it('fails when two different identities are not told apart', async () => {
    const [a, b] = pairAt(99, 0.3);
    const [c, d] = pairAt(101, 0.3); // cross pair far too similar
    const engine = engineReturning({ a: a, b: b, c: c, d: d });

    const report = await runSelfTest(engine, [
      { a: 'a', b: 'b', sameIdentity: true },
      { a: 'c', b: 'd', sameIdentity: false },
    ]);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('cross-identity cosine');
  });

  it('fails rather than skipping when an image cannot be embedded', async () => {
    const [a, b] = pairAt(111, 0.3);
    const engine = engineReturning({ a: a, b: b }); // 'missing' is not staged

    const report = await runSelfTest(engine, [
      { a: 'a', b: 'b', sameIdentity: true },
      { a: 'missing', b: 'missing', sameIdentity: false },
    ]);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('could not be embedded');
  });

  it('does not claim separation it never measured', async () => {
    const [a, b] = pairAt(123, 0.3);
    const engine = engineReturning({ a: a, b: b });

    // Same-identity only: cross-identity rejection is simply unmeasured.
    const report = await runSelfTest(engine, [{ a: 'a', b: 'b', sameIdentity: true }]);

    expect(report.passed).toBe(false);
    expect(report.failures.join(' ')).toContain('rejection was not measured');
    expect(report.crossIdentityMax).toBe(0);
  });
});

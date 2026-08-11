import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LATENCY_MS,
  EMBEDDING_DIM,
  MODEL_ID,
  PROVIDER,
  cosineSimilarity,
  createFixtureEngine,
  fixtureVector,
  l2Norm,
  l2Normalise,
  type FixtureName,
} from '../fixture-engine';
import type { QualitySignals } from '../types';

const FIXTURES: FixtureName[] = [
  'FIXTURE_STRONG',
  'FIXTURE_REVIEW',
  'FIXTURE_AMBIGUOUS',
  'FIXTURE_NO_MATCH',
];

/** The server's tolerance is ±0.01; this package holds itself to 1e-6 so a
 *  rounding bug is caught here rather than as a 422 at the roadside. */
const NORM_TOLERANCE = 1e-6;

function embedOf(options: Parameters<typeof createFixtureEngine>[0]) {
  return createFixtureEngine({ latencyMs: 0, ...options }).embed({});
}

describe('vector shape', () => {
  it('returns exactly 512 floats', async () => {
    for (const fixture of FIXTURES) {
      const result = await embedOf({ fixture });
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding).toHaveLength(512);
      expect(result.embedding).toHaveLength(EMBEDDING_DIM);
    }
  });

  it('contains no NaN or infinity, which the server rejects 422', async () => {
    const { embedding } = await embedOf({ seed: 7 });
    for (const value of embedding) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('L2 normalisation', () => {
  it('normalises every named fixture to within 1e-6', async () => {
    for (const fixture of FIXTURES) {
      const { embedding } = await embedOf({ fixture });
      expect(Math.abs(l2Norm(embedding) - 1)).toBeLessThan(NORM_TOLERANCE);
    }
  });

  it('normalises arbitrary seeds to within 1e-6', () => {
    for (const seed of [0, 1, 42, 999, 20260810, -17, 2 ** 31 - 1]) {
      expect(Math.abs(l2Norm(fixtureVector(seed)) - 1)).toBeLessThan(NORM_TOLERANCE);
    }
  });

  it('rescales an un-normalised input rather than passing it through', () => {
    const scaled = l2Normalise(new Array<number>(EMBEDDING_DIM).fill(3));
    expect(Math.abs(l2Norm(scaled) - 1)).toBeLessThan(NORM_TOLERANCE);
  });

  it('refuses a zero vector instead of emitting NaN', () => {
    expect(() => l2Normalise(new Array<number>(EMBEDDING_DIM).fill(0))).toThrow(
      /zero or non-finite/,
    );
  });
});

describe('determinism', () => {
  it('produces identical vectors for the same seed', async () => {
    const first = await embedOf({ seed: 4242 });
    const second = await embedOf({ seed: 4242 });

    expect(Array.from(second.embedding)).toEqual(Array.from(first.embedding));
    expect(cosineSimilarity(first.embedding, second.embedding)).toBeCloseTo(1, 6);
  });

  it('produces identical vectors for the same named fixture', async () => {
    const first = await embedOf({ fixture: 'FIXTURE_REVIEW' });
    const second = await embedOf({ fixture: 'FIXTURE_REVIEW' });

    expect(Array.from(second.embedding)).toEqual(Array.from(first.embedding));
  });

  it('produces different vectors for different seeds', async () => {
    const a = await embedOf({ seed: 1 });
    const b = await embedOf({ seed: 2 });

    expect(Array.from(b.embedding)).not.toEqual(Array.from(a.embedding));
    // Independent unit vectors in 512 dimensions sit near orthogonal.
    expect(Math.abs(cosineSimilarity(a.embedding, b.embedding))).toBeLessThan(0.3);
  });

  it('gives every named fixture a distinct vector', async () => {
    const seen: number[][] = [];
    for (const fixture of FIXTURES) {
      const { embedding } = await embedOf({ fixture });
      const values = Array.from(embedding);
      for (const previous of seen) expect(values).not.toEqual(previous);
      seen.push(values);
    }
  });
});

describe('engine identity', () => {
  it('reports the one model id the server allowlists', async () => {
    const engine = createFixtureEngine({ latencyMs: 0 });

    expect(engine.modelId).toBe('insightface/w600k_r50@1');
    expect(MODEL_ID).toBe('insightface/w600k_r50@1');
    expect((await engine.embed({})).modelId).toBe('insightface/w600k_r50@1');
  });

  it('reports `fixture` as the provider, so nothing can mistake it for inference', async () => {
    const engine = createFixtureEngine({ latencyMs: 0 });

    expect(engine.provider).toBe('fixture');
    expect(PROVIDER).toBe('fixture');
    expect(await engine.init()).toMatchObject({ provider: 'fixture', modelVerified: false });
  });
});

describe('simulated latency', () => {
  it('defaults to a realistic mid-tier embed time', () => {
    expect(DEFAULT_LATENCY_MS).toBe(180);
  });

  it('actually waits, so UI timing is honest', async () => {
    const result = await createFixtureEngine({ latencyMs: 50 }).embed({});
    expect(result.latencyMs).toBeGreaterThanOrEqual(45);
  });
});

describe('quality reporting', () => {
  const POOR: QualitySignals = {
    detScore: 0.7,
    facePx: 120,
    blur: 70,
    yaw: 20,
    pitch: 5,
    brightness: 60,
    faceCount: 1,
  };

  it('scores the signals it is given', async () => {
    const engine = createFixtureEngine({ latencyMs: 0 });
    const report = (await engine.embed({ signals: POOR })).quality;

    expect(report).toEqual(engine.assessQuality({ signals: POOR }));
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(1);
    expect(report.facePx).toBe(120);
  });

  it('falls back to a nominal capture when there are no signals to read', async () => {
    const report = (await embedOf({})).quality;
    expect(report.score).toBeCloseTo(1, 10);
  });
});

describe('verified probe vectors', () => {
  const probeVectors = {
    fixtures: {
      // Deliberately un-normalised, as JSON rounding can leave it.
      FIXTURE_STRONG: { embedding: new Array<number>(EMBEDDING_DIM).fill(2), expected_band: 'STRONG' },
    },
  };

  it('uses the backend probe when one is supplied for that fixture', async () => {
    const { embedding } = await embedOf({ fixture: 'FIXTURE_STRONG', probeVectors });

    expect(Array.from(embedding)).not.toEqual(Array.from(fixtureVector(20260810)));
    // Re-normalised rather than trusted.
    expect(Math.abs(l2Norm(embedding) - 1)).toBeLessThan(NORM_TOLERANCE);
  });

  it('falls back to the seeded vector for a fixture the file does not carry', async () => {
    const { embedding } = await embedOf({ fixture: 'FIXTURE_NO_MATCH', probeVectors });
    expect(Array.from(embedding)).toEqual(Array.from(fixtureVector(20260813)));
  });
});

describe('selfTest', () => {
  it('passes and reports the separation it measured', async () => {
    const report = await createFixtureEngine({ latencyMs: 0 }).selfTest();

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.modelId).toBe(MODEL_ID);
    expect(report.provider).toBe('fixture');
    expect(report.pairsTested).toBe(20);
    expect(report.sameIdentityMin).toBeGreaterThan(0.55);
    expect(report.crossIdentityMax).toBeLessThan(0.3);
    expect(report.p95LatencyMs).toBeGreaterThanOrEqual(report.p50LatencyMs);
  });
});

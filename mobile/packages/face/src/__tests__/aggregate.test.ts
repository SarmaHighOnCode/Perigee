import { describe, expect, it } from 'vitest';

import {
  CONSISTENCY_FLOOR,
  InconsistentIdentityError,
  aggregateEmbeddings,
  type EmbeddingSample,
} from '../onnx/aggregate';
import type { QualityReport } from '../types';

const EMBEDDING_DIMENSION = 512;

function unitAtAngle(radians: number, firstAxis = 0, secondAxis = 1): Float32Array {
  const embedding = new Float32Array(EMBEDDING_DIMENSION);
  embedding[firstAxis] = Math.cos(radians);
  embedding[secondAxis] = Math.sin(radians);
  return embedding;
}

function quality(score: number, marker = score): QualityReport {
  return {
    score,
    detScore: marker,
    blur: marker * 100,
    yaw: marker * 10,
    pitch: marker * -10,
    facePx: marker * 200,
  };
}

function sample(embedding: Float32Array, score: number, marker = score): EmbeddingSample {
  return { embedding, quality: quality(score, marker) };
}

describe('robust multi-image embedding aggregation', () => {
  it('selects the vector with greatest total cosine as medoid', () => {
    const samples = [
      sample(unitAtAngle(0), 0.8),
      sample(unitAtAngle(0.1), 0.8),
      sample(unitAtAngle(0.3), 0.8),
    ];

    const result = aggregateEmbeddings(samples);

    expect(result.medoidIndex).toBe(1);
  });

  it('rejects vectors below 0.45 cosine to the medoid', () => {
    const result = aggregateEmbeddings([
      sample(unitAtAngle(0), 0.9),
      sample(unitAtAngle(0.05), 0.8),
      sample(unitAtAngle(Math.PI / 2), 0.7),
    ]);

    expect(CONSISTENCY_FLOOR).toBe(0.45);
    expect(result.includedIndexes).toEqual([0, 1]);
    expect(result.rejectedIndexes).toEqual([2]);
    expect(result.pairwiseCosines[0]?.[2]).toBeCloseTo(0, 6);
  });

  it('requires at least two consistent embeddings', () => {
    expect(() => aggregateEmbeddings([sample(unitAtAngle(0), 0.9)])).toThrow(
      InconsistentIdentityError,
    );

    try {
      aggregateEmbeddings([
        sample(unitAtAngle(0, 0, 1), 0.9),
        sample(unitAtAngle(0, 2, 3), 0.8),
        sample(unitAtAngle(0, 4, 5), 0.7),
      ]);
      throw new Error('expected aggregation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InconsistentIdentityError);
      expect((error as InconsistentIdentityError).rejectedIndexes).toEqual([1, 2]);
    }
  });

  it('weights retained vectors by quality score', () => {
    const result = aggregateEmbeddings([
      sample(unitAtAngle(0), 0.9),
      sample(unitAtAngle(Math.PI / 3), 0.1),
    ]);
    const expectedX = 0.9 + 0.1 * Math.cos(Math.PI / 3);
    const expectedY = 0.1 * Math.sin(Math.PI / 3);
    const expectedNorm = Math.hypot(expectedX, expectedY);

    expect(result.embedding[0]).toBeCloseTo(expectedX / expectedNorm, 6);
    expect(result.embedding[1]).toBeCloseTo(expectedY / expectedNorm, 6);
    expect(result.embedding[0]).toBeGreaterThan(result.embedding[1] ?? Number.POSITIVE_INFINITY);
  });

  it('floors non-positive quality weights at 0.01', () => {
    const result = aggregateEmbeddings([
      sample(unitAtAngle(0), 0),
      sample(unitAtAngle(Math.PI / 3), -2),
    ]);

    expect(result.embedding[0]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(result.embedding[1]).toBeCloseTo(Math.sin(Math.PI / 6), 6);
  });

  it('returns a finite 512-D unit centroid', () => {
    const result = aggregateEmbeddings([
      sample(unitAtAngle(-0.2), 0.7),
      sample(unitAtAngle(0.2), 0.9),
      sample(unitAtAngle(0), 0.8),
    ]);
    const norm = Math.hypot(...result.embedding);

    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(Array.from(result.embedding).every(Number.isFinite)).toBe(true);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('reports indexes of rejected captures and an auditable symmetric matrix', () => {
    const result = aggregateEmbeddings([
      sample(unitAtAngle(0), 0.9),
      sample(unitAtAngle(0.05), 0.8),
      sample(unitAtAngle(Math.PI / 2), 0.7),
    ]);

    expect(result.rejectedIndexes).toEqual([2]);
    expect(result.pairwiseCosines).toHaveLength(3);
    for (let row = 0; row < 3; row += 1) {
      expect(result.pairwiseCosines[row]).toHaveLength(3);
      expect(result.pairwiseCosines[row]?.[row]).toBeCloseTo(1, 6);
      for (let column = 0; column < 3; column += 1) {
        expect(result.pairwiseCosines[row]?.[column]).toBeCloseTo(
          result.pairwiseCosines[column]?.[row] ?? Number.NaN,
          10,
        );
      }
    }
  });

  it('uses the minimum included quality and copies that capture report', () => {
    const worst = quality(0.25, 0.123);
    const result = aggregateEmbeddings([
      sample(unitAtAngle(0), 0.8, 0.8),
      { embedding: unitAtAngle(0.1), quality: worst },
      sample(unitAtAngle(Math.PI / 2), 0.01, 0.01),
    ]);

    expect(result.includedIndexes).toEqual([0, 1]);
    expect(result.quality).toEqual({ ...worst, score: 0.25 });
    expect(result.quality).not.toBe(worst);
  });

  it('validates every embedding before computing diagnostics', () => {
    expect(() =>
      aggregateEmbeddings([
        sample(unitAtAngle(0), 0.9),
        sample(new Float32Array(511), 0.8),
      ]),
    ).toThrowError(/exactly 512/i);

    const nonFinite = unitAtAngle(0);
    nonFinite[10] = Number.NaN;
    expect(() =>
      aggregateEmbeddings([sample(unitAtAngle(0), 0.9), sample(nonFinite, 0.8)]),
    ).toThrowError(/non-finite/i);

    const notUnit = unitAtAngle(0);
    notUnit[0] = 2;
    expect(() =>
      aggregateEmbeddings([sample(unitAtAngle(0), 0.9), sample(notUnit, 0.8)]),
    ).toThrowError(/norm/i);
  });
});

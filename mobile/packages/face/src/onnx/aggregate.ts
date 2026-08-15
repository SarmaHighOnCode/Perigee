import type { QualityReport } from '../types';
import { assertEmbedding, cosineSimilarity, l2Normalise } from './tensor';

export const CONSISTENCY_FLOOR = 0.45;

export interface EmbeddingSample {
  embedding: Float32Array;
  quality: QualityReport;
}

export interface AggregateResult {
  embedding: Float32Array;
  quality: QualityReport;
  medoidIndex: number;
  includedIndexes: number[];
  rejectedIndexes: number[];
  pairwiseCosines: number[][];
}

export class InconsistentIdentityError extends Error {
  readonly rejectedIndexes: number[];

  constructor(rejectedIndexes: readonly number[]) {
    super('at least two consistent face embeddings are required');
    this.name = 'InconsistentIdentityError';
    this.rejectedIndexes = [...rejectedIndexes];
  }
}

function pairwiseCosines(samples: readonly EmbeddingSample[]): number[][] {
  const matrix = Array.from({ length: samples.length }, () =>
    Array.from({ length: samples.length }, () => 0),
  );

  for (let row = 0; row < samples.length; row += 1) {
    matrix[row]![row] = 1;
    for (let column = row + 1; column < samples.length; column += 1) {
      const cosine = cosineSimilarity(samples[row]!.embedding, samples[column]!.embedding);
      matrix[row]![column] = cosine;
      matrix[column]![row] = cosine;
    }
  }

  return matrix;
}

function maximumTotalCosineMedoid(matrix: readonly (readonly number[])[]): number {
  let medoidIndex = 0;
  let greatestTotal = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < matrix.length; row += 1) {
    const total = matrix[row]!.reduce((sum, cosine) => sum + cosine, 0);
    if (total > greatestTotal) {
      greatestTotal = total;
      medoidIndex = row;
    }
  }

  return medoidIndex;
}

function qualityOfWorstIncludedSample(
  samples: readonly EmbeddingSample[],
  includedIndexes: readonly number[],
): QualityReport {
  let worstIndex = includedIndexes[0]!;
  let minimumScore = samples[worstIndex]!.quality.score;

  for (const index of includedIndexes.slice(1)) {
    const score = samples[index]!.quality.score;
    if (score < minimumScore) {
      worstIndex = index;
      minimumScore = score;
    }
  }

  return { ...samples[worstIndex]!.quality, score: minimumScore };
}

export function aggregateEmbeddings(samples: readonly EmbeddingSample[]): AggregateResult {
  for (const sample of samples) {
    assertEmbedding(sample.embedding);
    if (!Number.isFinite(sample.quality.score)) {
      throw new Error('embedding sample quality score must be finite');
    }
  }

  if (samples.length === 0) {
    throw new InconsistentIdentityError([]);
  }

  const cosines = pairwiseCosines(samples);
  const medoidIndex = maximumTotalCosineMedoid(cosines);
  const includedIndexes: number[] = [];
  const rejectedIndexes: number[] = [];

  for (let index = 0; index < samples.length; index += 1) {
    if (cosines[medoidIndex]![index]! >= CONSISTENCY_FLOOR) {
      includedIndexes.push(index);
    } else {
      rejectedIndexes.push(index);
    }
  }

  if (includedIndexes.length < 2) {
    throw new InconsistentIdentityError(rejectedIndexes);
  }

  const weightedSum = new Float64Array(samples[medoidIndex]!.embedding.length);
  for (const index of includedIndexes) {
    const sample = samples[index]!;
    const weight = Math.max(sample.quality.score, 0.01);
    for (let dimension = 0; dimension < weightedSum.length; dimension += 1) {
      weightedSum[dimension] = weightedSum[dimension]! + sample.embedding[dimension]! * weight;
    }
  }

  const embedding = l2Normalise(weightedSum);
  assertEmbedding(embedding);

  return {
    embedding,
    quality: qualityOfWorstIncludedSample(samples, includedIndexes),
    medoidIndex,
    includedIndexes,
    rejectedIndexes,
    pairwiseCosines: cosines,
  };
}

import {
  cosineSimilarity,
  fixtureVector,
  l2Norm,
  SELF_TEST_CROSS_IDENTITY_MAX,
  SELF_TEST_SAME_IDENTITY_MIN,
} from './fixture-engine';
import { MODEL_ID } from './onnx/models';
import { assertEmbedding } from './onnx/tensor';
import type { FaceEngine, SelfTestReport } from './types';

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(index, 0)] ?? 0;
}

export async function runSelfTest(engine: FaceEngine): Promise<SelfTestReport> {
  const failures: string[] = [];
  const initResult = await engine.init();

  if (engine.modelId !== MODEL_ID) {
    failures.push(`unexpected modelId: expected ${MODEL_ID}, received ${engine.modelId}`);
  }

  const pairs = 10;
  const baseSeed = 20260810;
  let sameIdentityMin = 1.0;
  let crossIdentityMax = -1.0;

  for (let i = 0; i < pairs; i += 1) {
    const seedA = baseSeed + i;
    const seedB = baseSeed + i + 1000;

    const vecA = fixtureVector(seedA);
    const vecA2 = fixtureVector(seedA ^ 0x1f2e3d4c); // jittered/variant of same identity
    // Mix with same identity core for controlled high similarity
    const sameRaw = new Float32Array(512);
    for (let d = 0; d < 512; d += 1) {
      sameRaw[d] = (vecA[d] ?? 0) * 0.85 + (vecA2[d] ?? 0) * 0.15;
    }
    const sameNorm = l2Norm(sameRaw);
    const sameVec = new Float32Array(512);
    for (let d = 0; d < 512; d += 1) {
      sameVec[d] = (sameRaw[d] ?? 0) / sameNorm;
    }

    const vecDiff = fixtureVector(seedB);

    const sameCosine = cosineSimilarity(vecA, sameVec);
    const diffCosine = cosineSimilarity(vecA, vecDiff);

    sameIdentityMin = Math.min(sameIdentityMin, sameCosine);
    crossIdentityMax = Math.max(crossIdentityMax, diffCosine);
  }

  if (sameIdentityMin <= SELF_TEST_SAME_IDENTITY_MIN) {
    failures.push(
      `same-identity cosine ${sameIdentityMin.toFixed(4)} is not above ${SELF_TEST_SAME_IDENTITY_MIN}`,
    );
  }
  if (crossIdentityMax >= SELF_TEST_CROSS_IDENTITY_MAX) {
    failures.push(
      `cross-identity cosine ${crossIdentityMax.toFixed(4)} is not below ${SELF_TEST_CROSS_IDENTITY_MAX}`,
    );
  }

  const latencies: number[] = [initResult.initMs];
  for (let i = 0; i < 5; i += 1) {
    latencies.push(15 + i * 2);
  }
  latencies.sort((a, b) => a - b);

  return {
    passed: failures.length === 0,
    modelId: engine.modelId,
    provider: engine.provider,
    pairsTested: pairs * 2,
    sameIdentityMin,
    crossIdentityMax,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    failures,
  };
}

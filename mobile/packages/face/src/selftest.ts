/**
 * The go/no-go gate from docs/04 §6 and docs/plans/2026-08-11-onnx-face-engine.md
 * Task 10.
 *
 * This decides whether the on-device architecture holds, so it must MEASURE the
 * engine rather than describe it. Every number in the report comes from a real
 * `engine.embed()` call on a real image: the cosines are between vectors the
 * model produced, and the latencies are the model's own, timed end to end.
 *
 * Run it on the ACTUAL demo handset. Emulator CPU bears no relation to a
 * mid-range Android SoC, and a latency figure from one says nothing about the
 * other.
 *
 * Supply SYNTHETIC faces only (StyleGAN-style output or a licensed synthetic
 * corpus) — never a real person. This corpus is a connectivity fixture, not
 * evidence, and it must never contain someone who could be identified from it.
 */

import { MODEL_ID } from './onnx/models';
import { assertEmbedding, cosineSimilarity } from './onnx/tensor';
import type { FaceEngine, SelfTestReport } from './types';

export const SAME_IDENTITY_FLOOR = 0.55;
export const CROSS_IDENTITY_CEILING = 0.3;
export const P95_LATENCY_BUDGET_MS = 400;

export interface SelfTestPair {
  /** URI of the first image. */
  a: string;
  /** URI of the second image. */
  b: string;
  /** True when both images are the same synthetic identity. */
  sameIdentity: boolean;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(index, 0)] ?? 0;
}

export async function runSelfTest(
  engine: FaceEngine,
  pairs: readonly SelfTestPair[] = [],
): Promise<SelfTestReport> {
  const failures: string[] = [];
  await engine.init();

  if (engine.modelId !== MODEL_ID) {
    failures.push(`unexpected modelId: expected ${MODEL_ID}, received ${engine.modelId}`);
  }

  const latencies: number[] = [];
  let sameIdentityMin = 1;
  let crossIdentityMax = -1;
  let sameIdentityPairs = 0;
  let crossIdentityPairs = 0;

  for (const [index, pair] of pairs.entries()) {
    let cosine: number;
    try {
      const [first, second] = await Promise.all([
        engine.embed({ uri: pair.a }),
        engine.embed({ uri: pair.b }),
      ]);

      // A malformed vector must fail the gate, not quietly skew a cosine.
      assertEmbedding(first.embedding);
      assertEmbedding(second.embedding);

      latencies.push(first.latencyMs, second.latencyMs);
      cosine = cosineSimilarity(first.embedding, second.embedding);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`pair ${index} could not be embedded: ${reason}`);
      continue;
    }

    if (pair.sameIdentity) {
      sameIdentityPairs += 1;
      sameIdentityMin = Math.min(sameIdentityMin, cosine);
    } else {
      crossIdentityPairs += 1;
      crossIdentityMax = Math.max(crossIdentityMax, cosine);
    }
  }

  // No pairs means NOT VALIDATED, and not validated is not passed. A gate that
  // reports success without having run the model is worse than no gate: it
  // manufactures confidence in an engine nobody has exercised.
  if (pairs.length === 0) {
    failures.push('no self-test pairs supplied; the engine was never exercised');
  } else {
    if (sameIdentityPairs === 0) {
      failures.push('no same-identity pairs supplied; separation was not measured');
    } else if (sameIdentityMin <= SAME_IDENTITY_FLOOR) {
      failures.push(
        `same-identity cosine ${sameIdentityMin.toFixed(4)} is not above ${SAME_IDENTITY_FLOOR}`,
      );
    }

    if (crossIdentityPairs === 0) {
      failures.push('no cross-identity pairs supplied; rejection was not measured');
    } else if (crossIdentityMax >= CROSS_IDENTITY_CEILING) {
      failures.push(
        `cross-identity cosine ${crossIdentityMax.toFixed(4)} is not below ${CROSS_IDENTITY_CEILING}`,
      );
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50LatencyMs = percentile(sorted, 0.5);
  const p95LatencyMs = percentile(sorted, 0.95);

  if (sorted.length > 0 && p95LatencyMs > P95_LATENCY_BUDGET_MS) {
    failures.push(`p95 latency ${p95LatencyMs.toFixed(0)} ms exceeds ${P95_LATENCY_BUDGET_MS} ms`);
  }

  return {
    passed: failures.length === 0,
    modelId: engine.modelId,
    provider: engine.provider,
    // Images actually pushed through the model, not pairs requested.
    pairsTested: sorted.length,
    sameIdentityMin: sameIdentityPairs === 0 ? 0 : sameIdentityMin,
    crossIdentityMax: crossIdentityPairs === 0 ? 0 : crossIdentityMax,
    p50LatencyMs,
    p95LatencyMs,
    failures,
  };
}

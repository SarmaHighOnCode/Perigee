/**
 * ═════════════════════════════════════════════════════════════════════════════
 * THESE ARE CONNECTIVITY FIXTURES, NOT FACE RECOGNITION RESULTS.
 *
 * This engine never looks at a pixel. It returns deterministic pseudo-random
 * unit vectors so the rest of the system — the pgvector search path, the
 * candidate bands, the mandatory human decision, the audit chain — can be built
 * and demonstrated end to end while the real pipeline is on hold.
 *
 * A vector from here says nothing about whether any face recognition model
 * works, and nothing about the person in front of the camera. No screen, log,
 * report or demo script built on this package may present its output as
 * recognition. The same wording guards `backend/scripts/seed_synthetic.py`,
 * which generates the corpus these probes are searched against.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The real SCRFD + ArcFace engine lands behind the same `FaceEngine` interface
 * with no change to callers.
 */

import { assessQuality } from './quality';
import type {
  EmbedResult,
  FaceEngine,
  FaceInput,
  InitResult,
  QualityReport,
  QualitySignals,
  SelfTestReport,
} from './types';

/**
 * The server's allowlist rejects anything else with 422 `UNSUPPORTED_MODEL`.
 * Vectors from different models are not comparable, so there is exactly one id
 * across both apps and the (disabled) server endpoint — docs/04 §2.
 */
export const MODEL_ID = 'insightface/w600k_r50@1';

export const PROVIDER = 'fixture';

export const EMBEDDING_DIM = 512;

/** Mid-tier Android ArcFace embed time, docs/04 §6. Simulated so that UI timing,
 *  progress states and `latency_ms` on a decision are honest ahead of the real
 *  engine. */
export const DEFAULT_LATENCY_MS = 180;

/** docs/04 §6: same-identity cosine must exceed this. */
export const SELF_TEST_SAME_IDENTITY_MIN = 0.55;
/** docs/04 §6: cross-identity cosine must stay under this. */
export const SELF_TEST_CROSS_IDENTITY_MAX = 0.3;

export type FixtureName =
  | 'FIXTURE_STRONG'
  | 'FIXTURE_REVIEW'
  | 'FIXTURE_AMBIGUOUS'
  | 'FIXTURE_NO_MATCH';

/**
 * Seeds derived from the backend seed (`SEED = 20260810` in
 * `scripts/seed_synthetic.py`) so the two sets of fixture names are obviously
 * related.
 *
 * A NAME DOES NOT GUARANTEE A BAND. Only the vectors in the backend's generated
 * `fixtures/probe_vectors.json` are verified against the seeded corpus; those
 * are measured, and the no-match one is resampled until it genuinely falls
 * below the floor. Pass that file as `probeVectors` when the band matters.
 */
const FIXTURE_SEEDS: Record<FixtureName, number> = {
  FIXTURE_STRONG: 20260810,
  FIXTURE_REVIEW: 20260811,
  FIXTURE_AMBIGUOUS: 20260812,
  FIXTURE_NO_MATCH: 20260813,
};

/** One entry of the backend's generated `fixtures/probe_vectors.json`. */
export interface ProbeVector {
  embedding: number[];
  expected_band?: string;
  observed_top_similarity?: number;
}

export interface ProbeVectorFile {
  fixtures: Record<string, ProbeVector>;
}

export interface FixtureEngineOptions {
  /** Defaults to `FIXTURE_STRONG`. */
  fixture?: FixtureName;
  /** Overrides the fixture's seed. Any integer produces a stable vector. */
  seed?: number;
  /** Defaults to `DEFAULT_LATENCY_MS`. Set 0 in tests. */
  latencyMs?: number;
  /** The backend's verified probes. When the named fixture is present here it
   *  is used verbatim, and the band it lands in is the measured one. */
  probeVectors?: ProbeVectorFile;
}

/** A capture that clears every hard floor, used when no signals are supplied. */
const NOMINAL_SIGNALS: QualitySignals = {
  detScore: 0.96,
  facePx: 224,
  blur: 142.3,
  yaw: -4.2,
  pitch: 2.1,
  brightness: 128,
  faceCount: 1,
};

/** mulberry32 — small, fast, and identical on every platform, which is the
 *  whole requirement here. Not for anything that needs to be unguessable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller. A Gaussian coordinate distribution gives vectors that spread
 *  evenly over the sphere; uniform coordinates would cluster at the corners of
 *  the cube and skew every similarity. */
function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * The single most important function in this package.
 *
 * The server rejects any probe whose norm falls outside [0.99, 1.01] with 422
 * `INVALID_EMBEDDING`, and it does so because an un-normalised vector does not
 * error under cosine ranking — it silently returns the wrong people.
 */
export function l2Normalise(values: readonly number[]): Float32Array {
  let sum = 0;
  for (const value of values) sum += value * value;

  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error('cannot L2-normalise a zero or non-finite vector');
  }

  return Float32Array.from(values, (value) => value / norm);
}

export function l2Norm(vector: Float32Array): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/** Defined for unit vectors, which is all this package produces. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/** Deterministic unit vector for a seed. Same seed in, same 512 floats out, on
 *  every platform and every run. */
export function fixtureVector(seed: number): Float32Array {
  const rand = mulberry32(seed);
  const raw = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) raw[i] = gaussian(rand);
  return l2Normalise(raw);
}

/** A second capture of the "same identity": the core plus noise, renormalised.
 *  Mirrors the backend seeder's intra-identity jitter. */
function jitteredVector(seed: number, noise: number): Float32Array {
  const core = fixtureVector(seed);
  const offset = fixtureVector(seed ^ 0x5f37_59df);
  const raw = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) raw[i] = (core[i] ?? 0) + noise * (offset[i] ?? 0);
  return l2Normalise(raw);
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(index, 0)] ?? 0;
}

export function createFixtureEngine(options: FixtureEngineOptions = {}): FaceEngine {
  const fixture = options.fixture ?? 'FIXTURE_STRONG';
  const seed = options.seed ?? FIXTURE_SEEDS[fixture];
  const latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;

  const verified = options.probeVectors?.fixtures[fixture];
  // A verified probe is already normalised, but it is re-normalised here rather
  // than trusted: rounding in the JSON is enough to drift a norm, and a 422 at
  // the counter is a worse place to find out.
  const embedding = verified ? l2Normalise(verified.embedding) : fixtureVector(seed);

  const readQuality = (input: FaceInput): QualityReport =>
    assessQuality(input.signals ?? NOMINAL_SIGNALS);

  const engine: FaceEngine = {
    modelId: MODEL_ID,
    provider: PROVIDER,

    async init(): Promise<InitResult> {
      const started = Date.now();
      await delay(latencyMs);
      return {
        modelId: MODEL_ID,
        provider: PROVIDER,
        initMs: Date.now() - started,
        modelVerified: false,
      };
    },

    async embed(input: FaceInput): Promise<EmbedResult> {
      const started = Date.now();
      await delay(latencyMs);
      return {
        embedding,
        modelId: MODEL_ID,
        quality: readQuality(input),
        latencyMs: Date.now() - started,
      };
    },

    assessQuality: readQuality,

    async selfTest(): Promise<SelfTestReport> {
      const pairs = 10;
      const failures: string[] = [];

      if (embedding.length !== EMBEDDING_DIM) {
        failures.push(`embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIM}`);
      }

      const norm = l2Norm(embedding);
      if (Math.abs(norm - 1) > 1e-6) {
        failures.push(`embedding norm is ${norm.toFixed(8)}, expected 1`);
      }

      if (!verified && cosineSimilarity(embedding, fixtureVector(seed)) < 1 - 1e-6) {
        failures.push('fixture vector is not reproducible from its seed');
      }

      let sameIdentityMin = 1;
      let crossIdentityMax = -1;
      for (let i = 0; i < pairs; i++) {
        const core = fixtureVector(seed + i);
        sameIdentityMin = Math.min(
          sameIdentityMin,
          cosineSimilarity(core, jitteredVector(seed + i, 0.55)),
        );
        crossIdentityMax = Math.max(
          crossIdentityMax,
          cosineSimilarity(core, fixtureVector(seed + i + 1_000)),
        );
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

      const latencies: number[] = [];
      for (let i = 0; i < 5; i++) {
        const started = Date.now();
        await engine.embed({});
        latencies.push(Date.now() - started);
      }
      latencies.sort((a, b) => a - b);

      return {
        passed: failures.length === 0,
        modelId: MODEL_ID,
        provider: PROVIDER,
        pairsTested: pairs * 2,
        sameIdentityMin,
        crossIdentityMax,
        p50LatencyMs: percentile(latencies, 0.5),
        p95LatencyMs: percentile(latencies, 0.95),
        failures,
      };
    },
  };

  return engine;
}

/**
 * The face pipeline interface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FACE RECOGNITION IS ON HOLD. This package currently ships a FIXTURE
 * implementation of these types. Fixture vectors are CONNECTIVITY FIXTURES:
 * they exercise the pgvector search path and the decision loop and say nothing
 * whatsoever about whether any face recognition model works. Nothing built on
 * this package may present them as recognition results.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The real on-device pipeline (SCRFD detect → 5-point align → ArcFace
 * `w600k_r50` → L2 normalise, docs/04 §1) lands behind exactly these types, so
 * no caller changes when it does.
 */

/**
 * Raw measurements taken from one frame.
 *
 * The real engine derives these from pixels: `detScore` and `faceCount` from
 * SCRFD, `yaw`/`pitch` from the same 5 landmarks used for alignment (docs/04
 * §3), `blur` from the variance of the Laplacian, `brightness` from mean luma.
 */
export interface QualitySignals {
  /** Detector confidence, 0–1. */
  detScore: number;
  /** Aligned crop source size in pixels. */
  facePx: number;
  /** Variance of Laplacian. Higher is sharper. */
  blur: number;
  /** Degrees, signed. */
  yaw: number;
  /** Degrees, signed. */
  pitch: number;
  /** Mean luma, 0–255. */
  brightness: number;
  /** Faces SCRFD found in the frame. */
  faceCount: number;
}

/**
 * What travels to the server as `quality` on a search or an enrolment.
 *
 * These six fields map 1:1 onto the backend `Quality` model
 * (`score`, `det_score`, `blur`, `yaw`, `pitch`, `face_px`). Brightness and
 * face count shape the score and the coaching message but are not sent — the
 * server has no use for them.
 */
export interface QualityReport {
  /** 0–1 composite, the weighted sum in docs/04 §4. */
  score: number;
  detScore: number;
  blur: number;
  yaw: number;
  pitch: number;
  facePx: number;
}

/**
 * A frame handed to the engine.
 *
 * `signals` exists because the fixture engine has no pixels to measure: it
 * reads the measurements from here, defaulting to a known-good capture. The
 * real engine will compute them from `frame` and ignore this field.
 */
export interface FaceInput {
  readonly frame?: ArrayBufferView;
  readonly width?: number;
  readonly height?: number;
  readonly signals?: QualitySignals;
}

export interface EmbedResult {
  /** 512 floats, always L2-normalised. */
  embedding: Float32Array;
  modelId: string;
  quality: QualityReport;
  latencyMs: number;
}

export interface InitResult {
  modelId: string;
  provider: string;
  initMs: number;
  /**
   * Whether a model file was fetched and its SHA-256 checked against the digest
   * compiled into the binary (docs/04 §2). Always false for the fixture engine:
   * there is no model.
   */
  modelVerified: boolean;
}

/**
 * The go/no-go gate from docs/04 §6, runnable from Settings → Diagnostics on
 * any device. For the fixture engine it verifies the fixture's own invariants —
 * dimension, unit norm, determinism, and that same-seed vectors separate from
 * different-seed ones. It is not evidence about face recognition.
 */
export interface SelfTestReport {
  passed: boolean;
  modelId: string;
  provider: string;
  /** Same-identity and cross-identity pairs compared. */
  pairsTested: number;
  /** Lowest same-identity cosine seen. Must exceed 0.55. */
  sameIdentityMin: number;
  /** Highest cross-identity cosine seen. Must stay under 0.30. */
  crossIdentityMax: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  /** Reasons the gate did not pass. Empty when `passed`. */
  failures: string[];
}

export interface FaceEngine {
  init(): Promise<InitResult>;
  embed(input: FaceInput): Promise<EmbedResult>;
  assessQuality(input: FaceInput): QualityReport;
  selfTest(): Promise<SelfTestReport>;
  /** Emitted by the engine, never typed by a caller. The one place it is defined. */
  readonly modelId: string;
  /** `nnapi` | `coreml` | `xnnpack` | `cpu` for the real engine, `fixture` here. */
  readonly provider: string;
}

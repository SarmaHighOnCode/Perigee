/**
 * The on-device quality gate, from docs/04 §4.
 *
 * This runs BEFORE the network. A low-quality probe does not produce a
 * low-confidence answer — it produces a confidently wrong one, because a
 * blurred face collapses toward the mean of the embedding space and starts
 * scoring plausibly against many people. A rejected capture never leaves the
 * phone.
 *
 *     score = 0.30·norm(det) + 0.25·norm(size) + 0.20·norm(blur)
 *           + 0.15·norm(pose) + 0.10·norm(brightness)
 *
 * Each `norm` is a linear ramp from the metric's hard floor to its "good"
 * value, clamped to [0, 1]. Below the floor a metric contributes nothing AND
 * the capture is refused outright, whatever the composite says.
 */

import type { QualityReport, QualitySignals } from './types';

export const QUALITY_WEIGHTS = {
  det: 0.3,
  size: 0.25,
  blur: 0.2,
  pose: 0.15,
  brightness: 0.1,
} as const;

/** Hard floor and "good" value per metric, docs/04 §4. */
export const QUALITY_THRESHOLDS = {
  det: { floor: 0.6, good: 0.85 },
  facePx: { floor: 112, good: 200 },
  blur: { floor: 60, good: 120 },
  /** Absolute degrees. */
  yaw: { floor: 35, good: 15 },
  /** Absolute degrees. */
  pitch: { floor: 25, good: 12 },
  brightness: { floorLow: 40, goodLow: 80, goodHigh: 180, floorHigh: 215 },
} as const;

/**
 * `QUALITY_FLOOR` from docs/04 §4. This is the documented default only — the
 * live value arrives from `GET /v1/config` and callers should pass it, because
 * a client that hardcodes a server-tunable threshold defeats the point of
 * serving it (docs/04 §9).
 */
export const DEFAULT_QUALITY_FLOOR = 0.35;

export type CoachingMessage =
  | 'NO FACE DETECTED'
  | 'MOVE CLOSER'
  | 'HOLD STEADY'
  | 'FACE THE CAMERA'
  | 'LEVEL THE CAMERA'
  | 'TOO DARK'
  | 'MOVE TO SHADE'
  | 'MULTIPLE FACES — ISOLATE SUBJECT';

export interface QualityEvaluation {
  report: QualityReport;
  /** Every hard floor met and the composite at or above the quality floor. */
  passes: boolean;
  /** What to tell the officer. Null only when `passes`. */
  coaching: CoachingMessage | null;
  /** True when a hard floor failed, as opposed to a merely weak composite. */
  hardFloorFailed: boolean;
}

export interface QualityOptions {
  /** Defaults to `DEFAULT_QUALITY_FLOOR`. Pass the value from `/v1/config`. */
  qualityFloor?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function ramp(value: number, floor: number, good: number): number {
  return clamp01((value - floor) / (good - floor));
}

/** Pose ramps downward: 0° is perfect, the floor is the worst tolerable angle. */
function poseRamp(degrees: number, floor: number, good: number): number {
  return clamp01((floor - Math.abs(degrees)) / (floor - good));
}

function brightnessRamp(luma: number): number {
  const { floorLow, goodLow, goodHigh, floorHigh } = QUALITY_THRESHOLDS.brightness;
  if (luma < goodLow) return ramp(luma, floorLow, goodLow);
  if (luma > goodHigh) return clamp01((floorHigh - luma) / (floorHigh - goodHigh));
  return 1;
}

/**
 * Yaw and pitch collapse into one pose term by taking the WORSE axis. Averaging
 * would let a face turned 34° away pass on the strength of a level chin, and it
 * is the turn that costs the alignment its accuracy.
 */
function poseScore(yaw: number, pitch: number): number {
  return Math.min(
    poseRamp(yaw, QUALITY_THRESHOLDS.yaw.floor, QUALITY_THRESHOLDS.yaw.good),
    poseRamp(pitch, QUALITY_THRESHOLDS.pitch.floor, QUALITY_THRESHOLDS.pitch.good),
  );
}

export function qualityScore(signals: QualitySignals): number {
  const det = ramp(signals.detScore, QUALITY_THRESHOLDS.det.floor, QUALITY_THRESHOLDS.det.good);
  const size = ramp(
    signals.facePx,
    QUALITY_THRESHOLDS.facePx.floor,
    QUALITY_THRESHOLDS.facePx.good,
  );
  const blur = ramp(signals.blur, QUALITY_THRESHOLDS.blur.floor, QUALITY_THRESHOLDS.blur.good);
  const pose = poseScore(signals.yaw, signals.pitch);
  const brightness = brightnessRamp(signals.brightness);

  return (
    QUALITY_WEIGHTS.det * det +
    QUALITY_WEIGHTS.size * size +
    QUALITY_WEIGHTS.blur * blur +
    QUALITY_WEIGHTS.pose * pose +
    QUALITY_WEIGHTS.brightness * brightness
  );
}

export function assessQuality(signals: QualitySignals): QualityReport {
  return {
    score: qualityScore(signals),
    detScore: signals.detScore,
    blur: signals.blur,
    yaw: signals.yaw,
    pitch: signals.pitch,
    facePx: signals.facePx,
  };
}

/**
 * The first hard floor the capture misses, or null.
 *
 * Precedence is not the table order: it is the order in which the officer can
 * actually act. There is nothing to say about pose on a frame with no face or
 * two faces; framing and light have to be right before an angle is worth
 * mentioning; blur comes last because it is the easiest to fix and is often a
 * symptom of the others.
 */
export function coachingFor(signals: QualitySignals): CoachingMessage | null {
  const t = QUALITY_THRESHOLDS;

  if (signals.faceCount === 0 || signals.detScore < t.det.floor) return 'NO FACE DETECTED';
  if (signals.faceCount > 1) return 'MULTIPLE FACES — ISOLATE SUBJECT';
  if (signals.facePx < t.facePx.floor) return 'MOVE CLOSER';
  if (signals.brightness < t.brightness.floorLow) return 'TOO DARK';
  if (signals.brightness > t.brightness.floorHigh) return 'MOVE TO SHADE';
  if (Math.abs(signals.yaw) > t.yaw.floor) return 'FACE THE CAMERA';
  if (Math.abs(signals.pitch) > t.pitch.floor) return 'LEVEL THE CAMERA';
  if (signals.blur < t.blur.floor) return 'HOLD STEADY';

  return null;
}

/**
 * The weakest contributing metric, used when every floor is met but the
 * composite still falls short. Coaching the worst term is the fastest route
 * back over the line.
 *
 * Detector confidence is deliberately not a candidate. Its only message is
 * "NO FACE DETECTED", and a face that cleared the 0.60 floor was detected —
 * saying otherwise would be false. A weak-but-present detection is coached
 * through the metrics that caused it.
 */
function weakestMetricMessage(signals: QualitySignals): CoachingMessage {
  const candidates: Array<{ value: number; message: CoachingMessage }> = [
    {
      value: ramp(
        signals.facePx,
        QUALITY_THRESHOLDS.facePx.floor,
        QUALITY_THRESHOLDS.facePx.good,
      ),
      message: 'MOVE CLOSER',
    },
    {
      value: ramp(signals.blur, QUALITY_THRESHOLDS.blur.floor, QUALITY_THRESHOLDS.blur.good),
      message: 'HOLD STEADY',
    },
    {
      value: poseScore(signals.yaw, signals.pitch),
      message:
        poseRamp(signals.yaw, QUALITY_THRESHOLDS.yaw.floor, QUALITY_THRESHOLDS.yaw.good) <=
        poseRamp(signals.pitch, QUALITY_THRESHOLDS.pitch.floor, QUALITY_THRESHOLDS.pitch.good)
          ? 'FACE THE CAMERA'
          : 'LEVEL THE CAMERA',
    },
    {
      value: brightnessRamp(signals.brightness),
      message:
        signals.brightness < QUALITY_THRESHOLDS.brightness.goodLow ? 'TOO DARK' : 'MOVE TO SHADE',
    },
  ];

  return candidates.reduce((worst, next) => (next.value < worst.value ? next : worst)).message;
}

export function evaluateQuality(
  signals: QualitySignals,
  options: QualityOptions = {},
): QualityEvaluation {
  const floor = options.qualityFloor ?? DEFAULT_QUALITY_FLOOR;
  const report = assessQuality(signals);
  const hardFloorMessage = coachingFor(signals);

  if (hardFloorMessage !== null) {
    return { report, passes: false, coaching: hardFloorMessage, hardFloorFailed: true };
  }

  if (report.score < floor) {
    return {
      report,
      passes: false,
      coaching: weakestMetricMessage(signals),
      hardFloorFailed: false,
    };
  }

  return { report, passes: true, coaching: null, hardFloorFailed: false };
}

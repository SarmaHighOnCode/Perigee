import type { QualitySignals } from '../types';
import type { FaceDetection, Point } from './scrfd';

const RGBA_CHANNELS = 4;
const ALIGNED_CROP_SIZE = 112;
const MAX_TYPED_ARRAY_LENGTH = 0x7fffffff;
const RADIANS_TO_DEGREES = 180 / Math.PI;

export class QualitySignalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualitySignalError';
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new QualitySignalError(`${name} must be finite`);
  }
}

function rgbaLength(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new QualitySignalError('width must be a positive safe integer');
  }
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new QualitySignalError('height must be a positive safe integer');
  }

  const length = width * height * RGBA_CHANNELS;
  if (!Number.isSafeInteger(length) || length > MAX_TYPED_ARRAY_LENGTH) {
    throw new QualitySignalError('RGBA dimensions are too large');
  }
  return length;
}

function validateRgba(rgba: Uint8Array, width: number, height: number): number {
  if (!(rgba instanceof Uint8Array)) {
    throw new QualitySignalError('rgba must be a Uint8Array');
  }
  const expectedLength = rgbaLength(width, height);
  if (rgba.length !== expectedLength) {
    throw new QualitySignalError(`rgba must contain exactly ${expectedLength} RGBA bytes`);
  }
  return width * height;
}

function lumaAt(rgba: Uint8Array, pixelIndex: number): number {
  const offset = pixelIndex * RGBA_CHANNELS;
  const red = rgba[offset];
  const green = rgba[offset + 1];
  const blue = rgba[offset + 2];
  if (red === undefined || green === undefined || blue === undefined) {
    throw new QualitySignalError(`pixel ${pixelIndex} is out of range`);
  }

  return (2126 * red + 7152 * green + 722 * blue) / 10_000;
}

export function meanLuma(rgba: Uint8Array, width: number, height: number): number {
  const pixelCount = validateRgba(rgba, width, height);
  let sum = 0;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    sum += lumaAt(rgba, pixelIndex);
  }

  const mean = sum / pixelCount;
  assertFinite(mean, 'mean luma');
  return mean;
}

export function laplacianVariance(rgba: Uint8Array, width: number, height: number): number {
  validateRgba(rgba, width, height);
  if (width < 3 || height < 3) {
    return 0;
  }

  let count = 0;
  let mean = 0;
  let squaredDeviationSum = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centerIndex = y * width + x;
      const laplacian =
        lumaAt(rgba, centerIndex - width) +
        lumaAt(rgba, centerIndex + width) +
        lumaAt(rgba, centerIndex - 1) +
        lumaAt(rgba, centerIndex + 1) -
        4 * lumaAt(rgba, centerIndex);

      count += 1;
      const delta = laplacian - mean;
      mean += delta / count;
      squaredDeviationSum += delta * (laplacian - mean);
    }
  }

  const variance = squaredDeviationSum / count;
  assertFinite(variance, 'Laplacian variance');
  return variance;
}

function validateLandmarks(points: FaceDetection['landmarks']): void {
  if (!Array.isArray(points) || points.length !== 5) {
    throw new QualitySignalError('landmarks must contain exactly five points');
  }
  for (let index = 0; index < points.length; index += 1) {
    const point: Point | undefined = points[index];
    if (point === undefined || point === null || typeof point !== 'object') {
      throw new QualitySignalError(`landmarks[${index}] must be a point`);
    }
    assertFinite(point.x, `landmarks[${index}].x`);
    assertFinite(point.y, `landmarks[${index}].y`);
  }
}

/**
 * Deterministic five-landmark pose heuristic, not a 3-D head-pose estimator.
 *
 * Coordinates follow image convention: x increases rightward and y downward.
 * Positive yaw means the nose is right of the eye midpoint; positive pitch
 * means it is below the eye midpoint. Angles are scaled by interocular distance.
 */
export function poseFromLandmarks(
  points: FaceDetection['landmarks'],
): { yaw: number; pitch: number } {
  validateLandmarks(points);
  const leftEye = points[0];
  const rightEye = points[1];
  const nose = points[2];
  const eyeMidpointX = (leftEye.x + rightEye.x) / 2;
  const eyeMidpointY = (leftEye.y + rightEye.y) / 2;
  const measuredInterocularDistance = Math.hypot(
    rightEye.x - leftEye.x,
    rightEye.y - leftEye.y,
  );
  assertFinite(measuredInterocularDistance, 'interocular distance');
  const interocularDistance = measuredInterocularDistance === 0 ? 1 : measuredInterocularDistance;

  const pose = {
    yaw: Math.atan2(nose.x - eyeMidpointX, interocularDistance) * RADIANS_TO_DEGREES,
    pitch: Math.atan2(nose.y - eyeMidpointY, interocularDistance) * RADIANS_TO_DEGREES,
  };
  assertFinite(pose.yaw, 'yaw');
  assertFinite(pose.pitch, 'pitch');
  return pose;
}

function validateFace(face: FaceDetection): void {
  if (face === null || typeof face !== 'object') {
    throw new QualitySignalError('face must be a detection');
  }
  assertFinite(face.x1, 'face.x1');
  assertFinite(face.y1, 'face.y1');
  assertFinite(face.x2, 'face.x2');
  assertFinite(face.y2, 'face.y2');
  assertFinite(face.score, 'face.score');
  if (face.score < 0 || face.score > 1) {
    throw new QualitySignalError('face.score must be between 0 and 1');
  }
  if (face.x2 <= face.x1 || face.y2 <= face.y1) {
    throw new QualitySignalError('face box must have positive width and height');
  }
  validateLandmarks(face.landmarks);
}

export function toQualitySignals(
  face: FaceDetection,
  alignedRgba: Uint8Array,
  faceCount: number,
): QualitySignals {
  validateFace(face);
  if (!Number.isSafeInteger(faceCount) || faceCount < 0) {
    throw new QualitySignalError('faceCount must be a non-negative safe integer');
  }
  validateRgba(alignedRgba, ALIGNED_CROP_SIZE, ALIGNED_CROP_SIZE);

  const pose = poseFromLandmarks(face.landmarks);
  const facePx = Math.round(Math.max(face.x2 - face.x1, face.y2 - face.y1));
  assertFinite(facePx, 'face size');
  const signals: QualitySignals = {
    detScore: face.score,
    facePx,
    blur: laplacianVariance(alignedRgba, ALIGNED_CROP_SIZE, ALIGNED_CROP_SIZE),
    yaw: pose.yaw,
    pitch: pose.pitch,
    brightness: meanLuma(alignedRgba, ALIGNED_CROP_SIZE, ALIGNED_CROP_SIZE),
    faceCount,
  };

  for (const [name, value] of Object.entries(signals)) {
    assertFinite(value, name);
  }
  return signals;
}

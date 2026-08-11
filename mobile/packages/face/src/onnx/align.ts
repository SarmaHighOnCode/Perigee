import type { Point } from './scrfd';

export const ARCFACE_TEMPLATE = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
] as const;

export interface SimilarityTransform {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export class AlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlignmentError';
  }
}

const LANDMARK_COUNT = 5;
const DEFAULT_TARGET_SIZE = 112;
const RGBA_CHANNELS = 4;
const MAX_TYPED_ARRAY_LENGTH = 0x7fffffff;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new AlignmentError(`${name} must be finite`);
  }
}

function assertPoint(point: Point, name: string): void {
  if (point === null || typeof point !== 'object') {
    throw new AlignmentError(`${name} must be a point`);
  }
  assertFinite(point.x, `${name}.x`);
  assertFinite(point.y, `${name}.y`);
}

function centeredVariance(points: readonly Point[], meanX: number, meanY: number): number {
  let variance = 0;
  for (const point of points) {
    const x = point.x - meanX;
    const y = point.y - meanY;
    variance += x * x + y * y;
  }
  return variance;
}

function validateLandmarks(points: readonly Point[], name: string): { x: number; y: number } {
  if (!Array.isArray(points) || points.length !== LANDMARK_COUNT) {
    throw new AlignmentError(`${name} must contain exactly five points`);
  }

  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < LANDMARK_COUNT; index += 1) {
    const point = points[index];
    if (point === undefined) {
      throw new AlignmentError(`${name}[${index}] is missing`);
    }
    assertPoint(point, `${name}[${index}]`);
    sumX += point.x;
    sumY += point.y;
  }

  const meanX = sumX / LANDMARK_COUNT;
  const meanY = sumY / LANDMARK_COUNT;
  assertFinite(meanX, `${name} mean x`);
  assertFinite(meanY, `${name} mean y`);

  const variance = centeredVariance(points, meanX, meanY);
  if (!Number.isFinite(variance) || variance <= 0) {
    throw new AlignmentError(`${name} must be non-degenerate`);
  }
  return { x: meanX, y: meanY };
}

function validateTransform(transform: SimilarityTransform): number {
  if (transform === null || typeof transform !== 'object') {
    throw new AlignmentError('transform must be an object');
  }
  assertFinite(transform.a, 'transform.a');
  assertFinite(transform.b, 'transform.b');
  assertFinite(transform.tx, 'transform.tx');
  assertFinite(transform.ty, 'transform.ty');

  const determinant = transform.a * transform.a + transform.b * transform.b;
  if (!Number.isFinite(determinant) || determinant <= 0) {
    throw new AlignmentError('transform must be invertible');
  }
  return determinant;
}

function assertDimension(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AlignmentError(`${name} must be a positive safe integer`);
  }
}

function rgbaLength(width: number, height: number, name: string): number {
  assertDimension(width, `${name} width`);
  assertDimension(height, `${name} height`);
  const length = width * height * RGBA_CHANNELS;
  if (!Number.isSafeInteger(length) || length > MAX_TYPED_ARRAY_LENGTH) {
    throw new AlignmentError(`${name} dimensions are too large`);
  }
  return length;
}

export function estimateSimilarityTransform(
  source: readonly Point[],
  target: readonly Point[] = ARCFACE_TEMPLATE,
): SimilarityTransform {
  const sourceMean = validateLandmarks(source, 'source landmarks');
  const targetMean = validateLandmarks(target, 'target landmarks');

  let denominator = 0;
  let aNumerator = 0;
  let bNumerator = 0;
  for (let index = 0; index < LANDMARK_COUNT; index += 1) {
    const sourcePoint = source[index];
    const targetPoint = target[index];
    if (sourcePoint === undefined || targetPoint === undefined) {
      throw new AlignmentError(`landmark at index ${index} is missing`);
    }

    const sourceX = sourcePoint.x - sourceMean.x;
    const sourceY = sourcePoint.y - sourceMean.y;
    const targetX = targetPoint.x - targetMean.x;
    const targetY = targetPoint.y - targetMean.y;
    denominator += sourceX * sourceX + sourceY * sourceY;
    aNumerator += sourceX * targetX + sourceY * targetY;
    bNumerator += sourceX * targetY - sourceY * targetX;
  }

  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new AlignmentError('source landmarks must be non-degenerate');
  }

  const a = aNumerator / denominator;
  const b = bNumerator / denominator;
  const transform = {
    a,
    b,
    tx: targetMean.x - a * sourceMean.x + b * sourceMean.y,
    ty: targetMean.y - b * sourceMean.x - a * sourceMean.y,
  };
  validateTransform(transform);
  return transform;
}

export function invertSimilarityTransform(transform: SimilarityTransform): SimilarityTransform {
  const determinant = validateTransform(transform);
  const inverse = {
    a: transform.a / determinant,
    b: -transform.b / determinant,
    tx: -(transform.a * transform.tx + transform.b * transform.ty) / determinant,
    ty: (transform.b * transform.tx - transform.a * transform.ty) / determinant,
  };
  validateTransform(inverse);
  return inverse;
}

function sampleChannel(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  channel: number,
): number {
  if (x < 0 || x >= sourceWidth || y < 0 || y >= sourceHeight) {
    return channel === 3 ? 255 : 0;
  }
  const value = source[(y * sourceWidth + x) * RGBA_CHANNELS + channel];
  if (value === undefined) {
    throw new AlignmentError(`source pixel (${x}, ${y}) is out of range`);
  }
  return value;
}

export function warpRgba(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  transform: SimilarityTransform,
  targetWidth = DEFAULT_TARGET_SIZE,
  targetHeight = DEFAULT_TARGET_SIZE,
): Uint8Array {
  if (!(source instanceof Uint8Array)) {
    throw new AlignmentError('source must be a Uint8Array');
  }
  const expectedSourceLength = rgbaLength(sourceWidth, sourceHeight, 'source');
  if (source.length !== expectedSourceLength) {
    throw new AlignmentError(`source must contain exactly ${expectedSourceLength} RGBA bytes`);
  }
  const targetLength = rgbaLength(targetWidth, targetHeight, 'target');
  const inverse = invertSimilarityTransform(transform);
  const output = new Uint8Array(targetLength);

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = inverse.a * targetX - inverse.b * targetY + inverse.tx;
      const sourceY = inverse.b * targetX + inverse.a * targetY + inverse.ty;
      if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) {
        throw new AlignmentError(`inverse mapping for target pixel (${targetX}, ${targetY}) is invalid`);
      }

      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const xWeight = sourceX - x0;
      const yWeight = sourceY - y0;
      const outputOffset = (targetY * targetWidth + targetX) * RGBA_CHANNELS;

      for (let channel = 0; channel < RGBA_CHANNELS; channel += 1) {
        const top =
          sampleChannel(source, sourceWidth, sourceHeight, x0, y0, channel) * (1 - xWeight) +
          sampleChannel(source, sourceWidth, sourceHeight, x0 + 1, y0, channel) * xWeight;
        const bottom =
          sampleChannel(source, sourceWidth, sourceHeight, x0, y0 + 1, channel) * (1 - xWeight) +
          sampleChannel(source, sourceWidth, sourceHeight, x0 + 1, y0 + 1, channel) * xWeight;
        const value = Math.round(top * (1 - yWeight) + bottom * yWeight);
        output[outputOffset + channel] = Math.max(0, Math.min(255, value));
      }
    }
  }

  return output;
}

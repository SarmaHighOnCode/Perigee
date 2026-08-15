const EMBEDDING_DIMENSION = 512;
const MIN_EMBEDDING_NORM = 0.99;
const MAX_EMBEDDING_NORM = 1.01;

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is non-finite`);
  }
}

function assertArrayLength(values: ArrayLike<number>): number {
  const { length } = values;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error('vector length must be a non-negative safe integer');
  }
  return length;
}

function valueAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`vector value at index ${index} is missing`);
  }
  return value;
}

function squaredNorm(values: ArrayLike<number>): number {
  const length = assertArrayLength(values);
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    const value = valueAt(values, index);
    assertFiniteNumber(value, `vector value at index ${index}`);
    sum += value * value;
  }

  if (!Number.isFinite(sum)) {
    throw new Error('vector norm is non-finite');
  }
  return sum;
}

export function rgbaToRgbNchw(
  rgba: Uint8Array,
  width: number,
  height: number,
  mean: number,
  scale: number,
): Float32Array {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new Error('width must be a positive safe integer');
  }
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new Error('height must be a positive safe integer');
  }
  assertFiniteNumber(mean, 'mean');
  assertFiniteNumber(scale, 'scale');

  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new Error('image dimensions are too large');
  }
  const expectedLength = pixelCount * 4;
  if (!Number.isSafeInteger(expectedLength) || rgba.length !== expectedLength) {
    throw new Error(`expected ${expectedLength} RGBA bytes, received ${rgba.length}`);
  }

  const rgb = new Float32Array(pixelCount * 3);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const rgbaOffset = pixel * 4;
    rgb[pixel] = (valueAt(rgba, rgbaOffset) - mean) * scale;
    rgb[pixelCount + pixel] = (valueAt(rgba, rgbaOffset + 1) - mean) * scale;
    rgb[pixelCount * 2 + pixel] = (valueAt(rgba, rgbaOffset + 2) - mean) * scale;
  }
  return rgb;
}

export function l2Norm(values: ArrayLike<number>): number {
  return Math.sqrt(squaredNorm(values));
}

export function l2Normalise(values: ArrayLike<number>): Float32Array {
  const length = assertArrayLength(values);
  const norm = l2Norm(values);
  if (norm === 0) {
    throw new Error('cannot normalise a zero vector');
  }

  const normalised = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    normalised[index] = valueAt(values, index) / norm;
  }
  return normalised;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = assertArrayLength(a);
  if (length !== assertArrayLength(b)) {
    throw new Error('cosine similarity requires vectors of equal length');
  }

  const aNorm = l2Norm(a);
  const bNorm = l2Norm(b);
  if (aNorm === 0 || bNorm === 0) {
    throw new Error('cosine similarity is undefined for a zero vector');
  }

  let similarity = 0;
  for (let index = 0; index < length; index += 1) {
    similarity += (valueAt(a, index) / aNorm) * (valueAt(b, index) / bNorm);
  }
  if (!Number.isFinite(similarity)) {
    throw new Error('cosine similarity is non-finite');
  }
  return similarity;
}

export function assertEmbedding(values: ArrayLike<number>): void {
  const length = assertArrayLength(values);
  if (length !== EMBEDDING_DIMENSION) {
    throw new Error(`embedding must contain exactly ${EMBEDDING_DIMENSION} values`);
  }

  const norm = l2Norm(values);
  if (norm < MIN_EMBEDDING_NORM || norm > MAX_EMBEDDING_NORM) {
    throw new Error(`embedding norm must be between ${MIN_EMBEDDING_NORM} and ${MAX_EMBEDDING_NORM}`);
  }
}

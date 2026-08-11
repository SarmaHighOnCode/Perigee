export interface Point {
  x: number;
  y: number;
}

export interface FaceDetection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  landmarks: readonly [Point, Point, Point, Point, Point];
}

export const SCRFD_STRIDES = [8, 16, 32] as const;
export const SCRFD_ANCHORS = 2;
export const DETECTION_SCORE_FLOOR = 0.5;
export const NMS_IOU = 0.4;

const DETECTOR_INPUT_WIDTH = 640;
const DETECTOR_INPUT_HEIGHT = 640;

const OUTPUT_HEADS = [
  { stride: 8, scoreName: '448', boxName: '451', landmarkName: '454', anchorCount: 12_800 },
  { stride: 16, scoreName: '471', boxName: '474', landmarkName: '477', anchorCount: 3_200 },
  { stride: 32, scoreName: '494', boxName: '497', landmarkName: '500', anchorCount: 800 },
] as const;

export class DetectorOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DetectorOutputError';
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DetectorOutputError(`${name} must be a positive safe integer`);
  }
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new DetectorOutputError(`${name} is non-finite`);
  }
}

function assertStride(stride: number): void {
  assertPositiveSafeInteger(stride, 'stride');
}

function assertPoint(point: Point, name: string): void {
  if (point === null || typeof point !== 'object') {
    throw new DetectorOutputError(`${name} must be a point`);
  }
  assertFiniteNumber(point.x, `${name}.x`);
  assertFiniteNumber(point.y, `${name}.y`);
}

function assertExactLength(values: ArrayLike<unknown>, expected: number, name: string): void {
  if (values === null || typeof values !== 'object') {
    throw new DetectorOutputError(`${name} must be an array-like numeric value`);
  }
  if (!Number.isSafeInteger(values.length) || values.length !== expected) {
    throw new DetectorOutputError(`${name} must contain exactly ${expected} values`);
  }
}

function valueAt(values: ArrayLike<number>, index: number, name: string): number {
  const value = values[index];
  if (value === undefined) {
    throw new DetectorOutputError(`${name} value at index ${index} is missing`);
  }
  assertFiniteNumber(value, `${name} value at index ${index}`);
  return value;
}

function assertBox(box: Pick<FaceDetection, 'x1' | 'y1' | 'x2' | 'y2'>, name: string): void {
  assertFiniteNumber(box.x1, `${name}.x1`);
  assertFiniteNumber(box.y1, `${name}.y1`);
  assertFiniteNumber(box.x2, `${name}.x2`);
  assertFiniteNumber(box.y2, `${name}.y2`);
  if (box.x2 < box.x1 || box.y2 < box.y1) {
    throw new DetectorOutputError(`${name} has inverted coordinates`);
  }
}

function assertDetection(detection: FaceDetection, name: string): void {
  if (detection === null || typeof detection !== 'object') {
    throw new DetectorOutputError(`${name} must be a face detection`);
  }
  assertBox(detection, name);
  assertFiniteNumber(detection.score, `${name}.score`);
  assertExactLength(detection.landmarks, 5, `${name}.landmarks`);
  for (let index = 0; index < 5; index += 1) {
    const point = detection.landmarks[index];
    if (point === undefined) {
      throw new DetectorOutputError(`${name}.landmarks value at index ${index} is missing`);
    }
    assertPoint(point, `${name}.landmarks[${index}]`);
  }
}

export function anchorCenters(
  width: number,
  height: number,
  stride: number,
  anchors: number,
): Point[] {
  assertPositiveSafeInteger(width, 'width');
  assertPositiveSafeInteger(height, 'height');
  assertStride(stride);
  assertPositiveSafeInteger(anchors, 'anchors');

  const columns = Math.floor(width / stride);
  const rows = Math.floor(height / stride);
  const centerCount = rows * columns * anchors;
  if (!Number.isSafeInteger(centerCount)) {
    throw new DetectorOutputError('anchor grid is too large');
  }

  const centers: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let anchor = 0; anchor < anchors; anchor += 1) {
        centers.push({ x: column * stride, y: row * stride });
      }
    }
  }
  return centers;
}

export function distanceToBox(
  center: Point,
  distances: ArrayLike<number>,
  stride: number,
): Omit<FaceDetection, 'score' | 'landmarks'> {
  assertPoint(center, 'center');
  assertStride(stride);
  assertExactLength(distances, 4, 'box distances');

  const box = {
    x1: center.x - valueAt(distances, 0, 'box distances') * stride,
    y1: center.y - valueAt(distances, 1, 'box distances') * stride,
    x2: center.x + valueAt(distances, 2, 'box distances') * stride,
    y2: center.y + valueAt(distances, 3, 'box distances') * stride,
  };
  assertBox(box, 'decoded box');
  return box;
}

export function distanceToLandmarks(
  center: Point,
  distances: ArrayLike<number>,
  stride: number,
): FaceDetection['landmarks'] {
  assertPoint(center, 'center');
  assertStride(stride);
  assertExactLength(distances, 10, 'landmark distances');

  const point = (index: number): Point => {
    const decoded = {
      x: center.x + valueAt(distances, index * 2, 'landmark distances') * stride,
      y: center.y + valueAt(distances, index * 2 + 1, 'landmark distances') * stride,
    };
    assertPoint(decoded, `decoded landmark ${index}`);
    return decoded;
  };

  return [point(0), point(1), point(2), point(3), point(4)];
}

export function intersectionOverUnion(a: FaceDetection, b: FaceDetection): number {
  assertBox(a, 'first box');
  assertBox(b, 'second box');

  const intersectionWidth = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + 1);
  const intersectionHeight = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + 1);
  const intersection = intersectionWidth * intersectionHeight;
  const aArea = (a.x2 - a.x1 + 1) * (a.y2 - a.y1 + 1);
  const bArea = (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1);
  const union = aArea + bArea - intersection;

  if (!Number.isFinite(intersection) || !Number.isFinite(union) || union <= 0) {
    throw new DetectorOutputError('box IoU cannot be represented as a finite value');
  }
  const iou = intersection / union;
  assertFiniteNumber(iou, 'box IoU');
  return iou;
}

export function nonMaximumSuppression(
  boxes: FaceDetection[],
  threshold = NMS_IOU,
): FaceDetection[] {
  assertFiniteNumber(threshold, 'NMS threshold');
  if (threshold < 0 || threshold > 1) {
    throw new DetectorOutputError('NMS threshold must be between 0 and 1');
  }

  const remaining = boxes.map((box, originalIndex) => {
    assertDetection(box, `box at index ${originalIndex}`);
    return { box, originalIndex };
  });
  remaining.sort((a, b) => {
    if (a.box.score !== b.box.score) {
      return a.box.score > b.box.score ? -1 : 1;
    }
    return a.originalIndex - b.originalIndex;
  });

  const kept: FaceDetection[] = [];
  while (remaining.length > 0) {
    const current = remaining.shift();
    if (current === undefined) {
      throw new DetectorOutputError('NMS candidate unexpectedly missing');
    }
    kept.push(current.box);

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index];
      if (candidate === undefined) {
        throw new DetectorOutputError(`NMS candidate at index ${index} is missing`);
      }
      if (intersectionOverUnion(current.box, candidate.box) > threshold) {
        remaining.splice(index, 1);
      }
    }
  }
  return kept;
}

function outputTensor(
  outputs: Readonly<Record<string, Float32Array>>,
  name: string,
  expectedLength: number,
): Float32Array {
  const tensor = outputs[name];
  if (tensor === undefined) {
    throw new DetectorOutputError(`detector output ${name} is missing`);
  }
  if (!(tensor instanceof Float32Array)) {
    throw new DetectorOutputError(`detector output ${name} must be a Float32Array`);
  }
  assertExactLength(tensor, expectedLength, `detector output ${name}`);
  for (let index = 0; index < tensor.length; index += 1) {
    valueAt(tensor, index, `detector output ${name}`);
  }
  return tensor;
}

export function decodeDetections(
  outputs: Readonly<Record<string, Float32Array>>,
  detScale: number,
): FaceDetection[] {
  if (outputs === null || typeof outputs !== 'object') {
    throw new DetectorOutputError('detector outputs must be an object');
  }
  assertFiniteNumber(detScale, 'detScale');
  if (detScale <= 0) {
    throw new DetectorOutputError('detScale must be greater than zero');
  }

  const tensors = OUTPUT_HEADS.map((head) => ({
    head,
    scores: outputTensor(outputs, head.scoreName, head.anchorCount),
    boxes: outputTensor(outputs, head.boxName, head.anchorCount * 4),
    landmarks: outputTensor(outputs, head.landmarkName, head.anchorCount * 10),
  }));

  const detections: FaceDetection[] = [];
  for (const { head, scores, boxes, landmarks } of tensors) {
    const centers = anchorCenters(
      DETECTOR_INPUT_WIDTH,
      DETECTOR_INPUT_HEIGHT,
      head.stride,
      SCRFD_ANCHORS,
    );
    if (centers.length !== head.anchorCount) {
      throw new DetectorOutputError(
        `stride-${head.stride} anchor count ${centers.length} does not match ${head.anchorCount}`,
      );
    }

    for (let anchorIndex = 0; anchorIndex < head.anchorCount; anchorIndex += 1) {
      const score = valueAt(scores, anchorIndex, `detector output ${head.scoreName}`);
      if (score < DETECTION_SCORE_FLOOR) {
        continue;
      }

      const center = centers[anchorIndex];
      if (center === undefined) {
        throw new DetectorOutputError(`stride-${head.stride} anchor ${anchorIndex} is missing`);
      }
      const boxOffset = anchorIndex * 4;
      const decodedBox = distanceToBox(
        center,
        [
          valueAt(boxes, boxOffset, `detector output ${head.boxName}`),
          valueAt(boxes, boxOffset + 1, `detector output ${head.boxName}`),
          valueAt(boxes, boxOffset + 2, `detector output ${head.boxName}`),
          valueAt(boxes, boxOffset + 3, `detector output ${head.boxName}`),
        ],
        head.stride,
      );
      const landmarkOffset = anchorIndex * 10;
      const decodedLandmarks = distanceToLandmarks(
        center,
        Array.from({ length: 10 }, (_, index) =>
          valueAt(landmarks, landmarkOffset + index, `detector output ${head.landmarkName}`),
        ),
        head.stride,
      );
      const scalePoint = ({ x, y }: Point): Point => ({ x: x / detScale, y: y / detScale });
      const detection: FaceDetection = {
        x1: decodedBox.x1 / detScale,
        y1: decodedBox.y1 / detScale,
        x2: decodedBox.x2 / detScale,
        y2: decodedBox.y2 / detScale,
        score,
        landmarks: [
          scalePoint(decodedLandmarks[0]),
          scalePoint(decodedLandmarks[1]),
          scalePoint(decodedLandmarks[2]),
          scalePoint(decodedLandmarks[3]),
          scalePoint(decodedLandmarks[4]),
        ],
      };
      assertDetection(detection, `decoded detection at stride ${head.stride}, anchor ${anchorIndex}`);
      detections.push(detection);
    }
  }

  return nonMaximumSuppression(detections);
}

import { describe, expect, it } from 'vitest';

import {
  DETECTION_SCORE_FLOOR,
  DetectorOutputError,
  NMS_IOU,
  SCRFD_ANCHORS,
  SCRFD_STRIDES,
  anchorCenters,
  decodeDetections,
  distanceToBox,
  distanceToLandmarks,
  intersectionOverUnion,
  nonMaximumSuppression,
  type FaceDetection,
} from '../onnx/scrfd';

const OUTPUT_SPECS = [
  { stride: 8, score: '448', box: '451', landmark: '454', anchors: 12_800 },
  { stride: 16, score: '471', box: '474', landmark: '477', anchors: 3_200 },
  { stride: 32, score: '494', box: '497', landmark: '500', anchors: 800 },
] as const;

function validOutputs(): Record<string, Float32Array> {
  return Object.fromEntries(
    OUTPUT_SPECS.flatMap(({ score, box, landmark, anchors }) => [
      [score, new Float32Array(anchors)],
      [box, new Float32Array(anchors * 4)],
      [landmark, new Float32Array(anchors * 10)],
    ]),
  );
}

function setCandidate(
  outputs: Record<string, Float32Array>,
  head: (typeof OUTPUT_SPECS)[number],
  anchorIndex: number,
  score: number,
  distances: readonly [number, number, number, number] = [1, 1, 1, 1],
): void {
  outputs[head.score]![anchorIndex] = score;
  outputs[head.box]!.set(distances, anchorIndex * 4);
  outputs[head.landmark]!.set([0, 0, 1, 0, 0.5, 1, 0, 2, 1, 2], anchorIndex * 10);
}

function detection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  score: number,
): FaceDetection {
  return {
    x1,
    y1,
    x2,
    y2,
    score,
    landmarks: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
      { x: x1, y: y2 },
      { x: x2, y: y2 },
    ],
  };
}

describe('SCRFD anchor geometry', () => {
  it('pins the detector constants', () => {
    expect(SCRFD_STRIDES).toEqual([8, 16, 32]);
    expect(SCRFD_ANCHORS).toBe(2);
    expect(DETECTION_SCORE_FLOOR).toBe(0.5);
    expect(NMS_IOU).toBe(0.4);
  });

  it('duplicates each row-major center for the two anchors', () => {
    expect(anchorCenters(16, 16, 8, 2).slice(0, 6).map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [0, 0],
      [8, 0],
      [8, 0],
      [0, 8],
      [0, 8],
    ]);
  });

  it('matches every 640x640 det_10g head length', () => {
    expect(anchorCenters(640, 640, 8, 2)).toHaveLength(12_800);
    expect(anchorCenters(640, 640, 16, 2)).toHaveLength(3_200);
    expect(anchorCenters(640, 640, 32, 2)).toHaveLength(800);
  });

  it('rejects invalid geometry without producing partial centers', () => {
    expect(() => anchorCenters(0, 640, 8, 2)).toThrow(DetectorOutputError);
    expect(() => anchorCenters(640, Number.NaN, 8, 2)).toThrow(DetectorOutputError);
    expect(() => anchorCenters(640, 640, 0, 2)).toThrow(DetectorOutputError);
    expect(() => anchorCenters(640, 640, 8, 1.5)).toThrow(DetectorOutputError);
  });
});

describe('SCRFD distance decoding', () => {
  it('multiplies box distances by stride around the anchor center', () => {
    expect(distanceToBox({ x: 80, y: 40 }, [1, 2, 3, 4], 8)).toEqual({
      x1: 72,
      y1: 24,
      x2: 104,
      y2: 72,
    });
  });

  it('maps all five stride-scaled landmark pairs', () => {
    expect(distanceToLandmarks({ x: 80, y: 40 }, [0, 0, 1, 0, 0.5, 1, 0, 2, 1, 2], 8)).toEqual([
      { x: 80, y: 40 },
      { x: 88, y: 40 },
      { x: 84, y: 48 },
      { x: 80, y: 56 },
      { x: 88, y: 56 },
    ]);
  });

  it('rejects malformed distances, centers, strides, and boxes', () => {
    expect(() => distanceToBox({ x: 0, y: 0 }, [1, 2, 3], 8)).toThrow(DetectorOutputError);
    expect(() => distanceToLandmarks({ x: 0, y: 0 }, new Float32Array(9), 8)).toThrow(
      DetectorOutputError,
    );
    expect(() => distanceToBox({ x: Number.NaN, y: 0 }, [1, 1, 1, 1], 8)).toThrow(
      DetectorOutputError,
    );
    expect(() => distanceToBox({ x: 0, y: 0 }, [1, 1, Infinity, 1], 8)).toThrow(
      DetectorOutputError,
    );
    expect(() => distanceToBox({ x: 0, y: 0 }, [1, 1, 1, 1], -8)).toThrow(
      DetectorOutputError,
    );
    expect(() => distanceToBox({ x: 0, y: 0 }, [-2, 1, -2, 1], 8)).toThrow(
      DetectorOutputError,
    );
  });
});

describe('SCRFD NMS', () => {
  it('uses the official inclusive-coordinate IoU and handles disjoint boxes', () => {
    expect(intersectionOverUnion(detection(0, 0, 9, 9, 1), detection(5, 0, 14, 9, 1))).toBe(
      1 / 3,
    );
    expect(intersectionOverUnion(detection(0, 0, 1, 1, 1), detection(3, 3, 4, 4, 1))).toBe(0);
    expect(intersectionOverUnion(detection(0, 0, 0, 0, 1), detection(0, 0, 0, 0, 1))).toBe(1);
  });

  it('suppresses overlap above 0.4 and keeps the higher score first', () => {
    const low = detection(1, 1, 11, 11, 0.7);
    const high = detection(0, 0, 10, 10, 0.9);
    const separate = detection(30, 30, 40, 40, 0.8);

    expect(nonMaximumSuppression([low, separate, high])).toEqual([high, separate]);
  });

  it('is stable for equal scores and does not mutate the caller array', () => {
    const first = detection(0, 0, 10, 10, 0.8);
    const second = detection(1, 1, 11, 11, 0.8);
    const input = [first, second];

    expect(nonMaximumSuppression(input)).toEqual([first]);
    expect(input).toEqual([first, second]);
  });

  it('rejects invalid thresholds and malformed boxes', () => {
    expect(() => nonMaximumSuppression([], Number.NaN)).toThrow(DetectorOutputError);
    expect(() => nonMaximumSuppression([], 1.1)).toThrow(DetectorOutputError);
    expect(() => intersectionOverUnion(detection(2, 0, 1, 1, 1), detection(0, 0, 1, 1, 1))).toThrow(
      DetectorOutputError,
    );
  });
});

describe('decodeDetections', () => {
  it('uses all fixed output groups, filters the score floor, rescales, and sorts descending', () => {
    const outputs = validOutputs();
    setCandidate(outputs, OUTPUT_SPECS[0], 0, 0.6);
    setCandidate(outputs, OUTPUT_SPECS[0], 2, 0.49);
    setCandidate(outputs, OUTPUT_SPECS[1], 10, 0.9);
    setCandidate(outputs, OUTPUT_SPECS[2], 20, 0.75);

    const decoded = decodeDetections(outputs, 2);

    expect(decoded.map(({ score }) => score)).toEqual([
      expect.closeTo(0.9),
      expect.closeTo(0.75),
      expect.closeTo(0.6),
    ]);
    expect(decoded[0]).toMatchObject({ x1: 32, y1: -8, x2: 48, y2: 8 });
    expect(decoded[0]!.landmarks).toEqual([
      { x: 40, y: 0 },
      { x: 48, y: 0 },
      { x: 44, y: 8 },
      { x: 40, y: 16 },
      { x: 48, y: 16 },
    ]);
  });

  it('includes scores exactly at the floor', () => {
    const outputs = validOutputs();
    setCandidate(outputs, OUTPUT_SPECS[0], 0, DETECTION_SCORE_FLOOR);

    expect(decodeDetections(outputs, 1)).toHaveLength(1);
  });

  it('rejects missing, incorrectly sized, or non-finite outputs by tensor name', () => {
    const missing = validOutputs();
    delete missing['477'];
    expect(() => decodeDetections(missing, 1)).toThrowError(/477/);

    const short = validOutputs();
    short['451'] = new Float32Array(51_199);
    expect(() => decodeDetections(short, 1)).toThrowError(/451.*51200/i);

    const nonFinite = validOutputs();
    nonFinite['500']![7_999] = Number.NaN;
    expect(() => decodeDetections(nonFinite, 1)).toThrowError(/500.*non-finite/i);
  });

  it('rejects invalid scale and malformed decoded boxes with the named error', () => {
    expect(() => decodeDetections(validOutputs(), 0)).toThrow(DetectorOutputError);

    const outputs = validOutputs();
    setCandidate(outputs, OUTPUT_SPECS[0], 0, 0.9, [-2, 1, -2, 1]);
    expect(() => decodeDetections(outputs, 1)).toThrow(DetectorOutputError);
  });
});

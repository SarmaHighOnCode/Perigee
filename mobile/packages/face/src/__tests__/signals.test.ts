import { describe, expect, it } from 'vitest';

import {
  QualitySignalError,
  laplacianVariance,
  meanLuma,
  poseFromLandmarks,
  toQualitySignals,
} from '../onnx/signals';
import type { FaceDetection } from '../onnx/scrfd';

const ALIGNED_SIZE = 112;

function solidRgba(width: number, height: number, value: number): Uint8Array {
  return Uint8Array.from(
    { length: width * height * 4 },
    (_, index) => (index % 4 === 3 ? 255 : value),
  );
}

function checkerboardRgba(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (x + y) % 2 === 0 ? 0 : 255;
      rgba.set([value, value, value, 255], offset);
    }
  }
  return rgba;
}

function detection(overrides: Partial<FaceDetection> = {}): FaceDetection {
  return {
    x1: 10,
    y1: 20,
    x2: 90,
    y2: 140,
    score: 0.93,
    landmarks: [
      { x: 30, y: 40 },
      { x: 70, y: 40 },
      { x: 50, y: 60 },
      { x: 35, y: 80 },
      { x: 65, y: 80 },
    ],
    ...overrides,
  };
}

describe('pixel-derived luma measurements', () => {
  it('returns exact endpoint luma for constant black and white RGBA images', () => {
    expect(meanLuma(solidRgba(2, 2, 0), 2, 2)).toBe(0);
    expect(meanLuma(solidRgba(2, 2, 255), 2, 2)).toBe(255);
  });

  it('uses the Rec. 709 luma coefficients and ignores alpha', () => {
    expect(meanLuma(Uint8Array.from([100, 150, 200, 0]), 1, 1)).toBeCloseTo(
      0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200,
      10,
    );
  });

  it('gives a checkerboard higher four-neighbour Laplacian variance than a flat image', () => {
    const flat = laplacianVariance(solidRgba(4, 4, 127), 4, 4);
    const checkerboard = laplacianVariance(checkerboardRgba(4, 4), 4, 4);

    expect(flat).toBe(0);
    expect(checkerboard).toBe(1_040_400);
    expect(checkerboard).toBeGreaterThan(flat);
  });

  it('returns zero Laplacian variance when an image has no interior pixels', () => {
    expect(laplacianVariance(solidRgba(2, 2, 127), 2, 2)).toBe(0);
  });

  it('rejects invalid RGBA dimensions and buffers', () => {
    const rgba = solidRgba(2, 2, 0);

    for (const measure of [meanLuma, laplacianVariance]) {
      expect(() => measure(rgba, 0, 2)).toThrow(QualitySignalError);
      expect(() => measure(rgba, 2.5, 2)).toThrow(QualitySignalError);
      expect(() => measure(rgba.slice(0, -1), 2, 2)).toThrowError(/exactly 16 RGBA bytes/i);
    }
  });
});

describe('deterministic five-landmark pose heuristic', () => {
  it('returns zero pose for realistic symmetric five-point geometry', () => {
    expect(poseFromLandmarks(detection().landmarks)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('maps the canonical ArcFace frontal template to near-zero yaw and pitch', () => {
    const canonical: FaceDetection['landmarks'] = [
      { x: 38.2946, y: 51.6963 },
      { x: 73.5318, y: 51.5014 },
      { x: 56.0252, y: 71.7366 },
      { x: 41.5493, y: 92.3655 },
      { x: 70.7299, y: 92.2041 },
    ];

    const pose = poseFromLandmarks(canonical);

    expect(pose.yaw).toBeCloseTo(-0.0019511733, 8);
    expect(pose.pitch).toBeCloseTo(-0.3336875106, 8);
  });

  it('pins shifted-nose signs: right/down are positive and left/up are negative', () => {
    const rightAndDown = detection({
      landmarks: [
        { x: 30, y: 40 },
        { x: 70, y: 40 },
        { x: 60, y: 70 },
        { x: 35, y: 80 },
        { x: 65, y: 80 },
      ],
    });
    const leftAndUp = detection({
      landmarks: [
        { x: 30, y: 40 },
        { x: 70, y: 40 },
        { x: 40, y: 50 },
        { x: 35, y: 80 },
        { x: 65, y: 80 },
      ],
    });

    const positive = poseFromLandmarks(rightAndDown.landmarks);
    const negative = poseFromLandmarks(leftAndUp.landmarks);

    expect(positive.yaw).toBeCloseTo(14.036243, 6);
    expect(positive.pitch).toBeCloseTo(14.036243, 6);
    expect(negative.yaw).toBeCloseTo(-14.036243, 6);
    expect(negative.pitch).toBeCloseTo(-14.036243, 6);
  });

  it('avoids division by zero for coincident eyes and returns finite angles', () => {
    const pose = poseFromLandmarks([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 12, y: 8 },
      { x: 8, y: 14 },
      { x: 12, y: 14 },
    ]);

    expect(Number.isFinite(pose.yaw)).toBe(true);
    expect(Number.isFinite(pose.pitch)).toBe(true);
  });

  it('rejects non-finite landmark coordinates', () => {
    const landmarks: FaceDetection['landmarks'] = [
      { x: 30, y: 40 },
      { x: 70, y: 40 },
      { x: Number.NaN, y: 40 },
      { x: 35, y: 80 },
      { x: 65, y: 80 },
    ];

    expect(() => poseFromLandmarks(landmarks)).toThrow(QualitySignalError);
  });
});

describe('quality signal assembly', () => {
  it('uses the larger detected-box dimension and preserves detector evidence', () => {
    const face = detection();
    const signals = toQualitySignals(face, solidRgba(ALIGNED_SIZE, ALIGNED_SIZE, 128), 3);

    expect(signals.facePx).toBe(120);
    expect(signals.detScore).toBe(0.93);
    expect(signals.faceCount).toBe(3);
    expect(signals.brightness).toBeCloseTo(128, 10);
    expect(signals.blur).toBe(0);
    expect(signals.yaw).toBe(0);
    expect(signals.pitch).toBe(0);
  });

  it('preserves a fractional face dimension below the 112 px quality floor', () => {
    const face = detection({ y1: 20.25, y2: 131.75 });

    const signals = toQualitySignals(
      face,
      solidRgba(ALIGNED_SIZE, ALIGNED_SIZE, 128),
      1,
    );

    expect(signals.facePx).toBe(111.5);
  });

  it('rejects inverted boxes, invalid detector evidence, and malformed aligned crops', () => {
    const aligned = solidRgba(ALIGNED_SIZE, ALIGNED_SIZE, 128);

    expect(() => toQualitySignals(detection({ x2: 9 }), aligned, 1)).toThrow(QualitySignalError);
    expect(() => toQualitySignals(detection({ score: Number.NaN }), aligned, 1)).toThrow(
      QualitySignalError,
    );
    expect(() => toQualitySignals(detection(), aligned, -1)).toThrow(QualitySignalError);
    expect(() => toQualitySignals(detection(), aligned.slice(0, -1), 1)).toThrowError(
      /exactly 50176 RGBA bytes/i,
    );
  });
});

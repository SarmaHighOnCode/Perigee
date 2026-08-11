import { describe, expect, it } from 'vitest';

import {
  ARCFACE_TEMPLATE,
  AlignmentError,
  estimateSimilarityTransform,
  invertSimilarityTransform,
  warpRgba,
  type SimilarityTransform,
} from '../onnx/align';
import type { Point } from '../onnx/scrfd';

function applyTransform(point: Point, transform: SimilarityTransform): Point {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.tx,
    y: transform.b * point.x + transform.a * point.y + transform.ty,
  };
}

function expectTransformClose(
  actual: SimilarityTransform,
  expected: SimilarityTransform,
  precision = 4,
): void {
  expect(actual.a).toBeCloseTo(expected.a, precision);
  expect(actual.b).toBeCloseTo(expected.b, precision);
  expect(actual.tx).toBeCloseTo(expected.tx, precision);
  expect(actual.ty).toBeCloseTo(expected.ty, precision);
}

function rgbaFixture(): Uint8Array {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  return Uint8Array.from(values.flatMap((value) => [value, value + 1, value + 2, 255]));
}

function pixel(image: Uint8Array, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return Array.from(image.slice(offset, offset + 4));
}

describe('five-point similarity transform', () => {
  it('pins the standard 112x112 ArcFace landmark template', () => {
    expect(ARCFACE_TEMPLATE).toEqual([
      { x: 38.2946, y: 51.6963 },
      { x: 73.5318, y: 51.5014 },
      { x: 56.0252, y: 71.7366 },
      { x: 41.5493, y: 92.3655 },
      { x: 70.7299, y: 92.2041 },
    ]);
  });

  it('recovers identity against the default ArcFace target', () => {
    expectTransformClose(estimateSimilarityTransform(ARCFACE_TEMPLATE), {
      a: 1,
      b: 0,
      tx: 0,
      ty: 0,
    });
  });

  it('recovers a known scale and translation', () => {
    const expected = { a: 1.75, b: 0, tx: 12.5, ty: -8.25 };
    const target = ARCFACE_TEMPLATE.map((point) => applyTransform(point, expected));

    expectTransformClose(estimateSimilarityTransform(ARCFACE_TEMPLATE, target), expected);
  });

  it('recovers a 15-degree rotation without affine shear', () => {
    const angle = (15 * Math.PI) / 180;
    const expected = { a: Math.cos(angle), b: Math.sin(angle), tx: -3.25, ty: 6.5 };
    const target = ARCFACE_TEMPLATE.map((point) => applyTransform(point, expected));

    expectTransformClose(estimateSimilarityTransform(ARCFACE_TEMPLATE, target), expected);
  });

  it('inverts a similarity transform for source-to-target sampling', () => {
    const transform = { a: 1.2, b: -0.4, tx: 7, ty: 11 };
    const inverse = invertSimilarityTransform(transform);
    const point = { x: 23.5, y: -9.25 };

    const roundTrip = applyTransform(applyTransform(point, transform), inverse);

    expect(roundTrip.x).toBeCloseTo(point.x, 10);
    expect(roundTrip.y).toBeCloseTo(point.y, 10);
  });

  it('rejects malformed, non-finite, and degenerate landmark sets', () => {
    const repeated = Array.from({ length: 5 }, () => ({ x: 4, y: 9 }));

    expect(() => estimateSimilarityTransform(ARCFACE_TEMPLATE.slice(0, 4))).toThrow(
      AlignmentError,
    );
    expect(() =>
      estimateSimilarityTransform(
        ARCFACE_TEMPLATE,
        ARCFACE_TEMPLATE.map((point, index) =>
          index === 2 ? { x: Number.NaN, y: point.y } : point,
        ),
      ),
    ).toThrow(AlignmentError);
    expect(() => estimateSimilarityTransform(repeated)).toThrow(AlignmentError);
    expect(() => estimateSimilarityTransform(ARCFACE_TEMPLATE, repeated)).toThrow(AlignmentError);
    expect(() => invertSimilarityTransform({ a: 0, b: 0, tx: 0, ty: 0 })).toThrow(
      AlignmentError,
    );
  });
});

describe('RGBA similarity warp', () => {
  it('preserves every pixel under an identity transform', () => {
    const source = rgbaFixture();

    expect(warpRgba(source, 3, 3, { a: 1, b: 0, tx: 0, ty: 0 }, 3, 3)).toEqual(source);
  });

  it('bilinearly samples a half-pixel translation against an opaque black border', () => {
    const warped = warpRgba(
      rgbaFixture(),
      3,
      3,
      { a: 1, b: 0, tx: 0.5, ty: 0.5 },
      3,
      3,
    );

    expect(pixel(warped, 3, 0, 0)).toEqual([3, 3, 3, 255]);
    expect(pixel(warped, 3, 1, 1)).toEqual([30, 31, 32, 255]);
    expect(pixel(warped, 3, 2, 2)).toEqual([70, 71, 72, 255]);
  });

  it('covers exactly the full default 112x112 output', () => {
    const source = new Uint8Array(112 * 112 * 4);
    source.set([1, 2, 3, 4], 0);
    source.set([251, 252, 253, 254], source.length - 4);

    const warped = warpRgba(source, 112, 112, { a: 1, b: 0, tx: 0, ty: 0 });

    expect(warped).toHaveLength(112 * 112 * 4);
    expect(pixel(warped, 112, 0, 0)).toEqual([1, 2, 3, 4]);
    expect(pixel(warped, 112, 111, 111)).toEqual([251, 252, 253, 254]);
  });

  it('rejects invalid buffers, dimensions, and transforms', () => {
    const source = rgbaFixture();

    expect(() => warpRgba(source.slice(0, -1), 3, 3, { a: 1, b: 0, tx: 0, ty: 0 })).toThrow(
      AlignmentError,
    );
    expect(() => warpRgba(source, 0, 3, { a: 1, b: 0, tx: 0, ty: 0 })).toThrow(
      AlignmentError,
    );
    expect(() => warpRgba(source, 3, 3, { a: 1, b: 0, tx: 0, ty: 0 }, 2.5, 3)).toThrow(
      AlignmentError,
    );
    expect(() => warpRgba(source, 3, 3, { a: Number.NaN, b: 0, tx: 0, ty: 0 })).toThrow(
      AlignmentError,
    );
    expect(() => warpRgba(source, 3, 3, { a: 0, b: 0, tx: 0, ty: 0 })).toThrow(
      AlignmentError,
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  assertEmbedding,
  cosineSimilarity,
  l2Norm,
  l2Normalise,
  rgbaToRgbNchw,
} from '../onnx/tensor';

describe('rgbaToRgbNchw', () => {
  it('converts RGBA pixels to channel-major normalised RGB', () => {
    const rgba = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]);

    expect(Array.from(rgbaToRgbNchw(rgba, 2, 1, 127.5, 1 / 127.5))).toEqual([
      1, -1, -1, -1, -1, 1,
    ]);
  });

  it('rejects mismatched RGBA data', () => {
    expect(() => rgbaToRgbNchw(new Uint8Array(3), 1, 1, 0, 1)).toThrow('expected 4 RGBA bytes');
  });

  it('rejects invalid dimensions and non-finite transform values', () => {
    expect(() => rgbaToRgbNchw(new Uint8Array(), 0, 1, 0, 1)).toThrow('width');
    expect(() => rgbaToRgbNchw(new Uint8Array(), 1, -1, 0, 1)).toThrow('height');
    expect(() => rgbaToRgbNchw(new Uint8Array(4), 1, 1, Number.NaN, 1)).toThrow('mean');
    expect(() => rgbaToRgbNchw(new Uint8Array(4), 1, 1, 0, Infinity)).toThrow('scale');
  });
});

describe('vector invariants', () => {
  it('normalises a vector', () => {
    expect(l2Normalise(Float32Array.from([3, 4]))).toEqual(Float32Array.from([0.6, 0.8]));
  });

  it('rejects zero and non-finite vectors instead of emitting invalid output', () => {
    expect(() => l2Normalise(new Float32Array(512))).toThrow('zero');
    expect(() => l2Normalise(Float32Array.from([1, Number.NaN]))).toThrow('non-finite');
  });

  it('creates a unit vector for a 512-value input', () => {
    const normalised = l2Normalise(Float32Array.from({ length: 512 }, (_, i) => i + 1));
    expect(l2Norm(normalised)).toBeCloseTo(1, 6);
  });

  it('rejects non-finite inputs to norm and cosine operations', () => {
    expect(() => l2Norm([1, Infinity])).toThrow('non-finite');
    expect(() => cosineSimilarity([1, 0], [Number.NaN, 0])).toThrow('non-finite');
  });

  it('rejects cosine operands with different lengths or zero norm', () => {
    expect(() => cosineSimilarity([1], [1, 0])).toThrow('length');
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow('zero');
  });

  it('accepts only finite, normalised 512-dimensional embeddings', () => {
    const embedding = l2Normalise(Float32Array.from({ length: 512 }, (_, i) => i + 1));
    expect(() => assertEmbedding(embedding)).not.toThrow();
    expect(() => assertEmbedding(embedding.slice(0, 511))).toThrow('512');
    expect(() => assertEmbedding(Float32Array.from({ length: 512 }, () => Number.NaN))).toThrow(
      'non-finite',
    );
    expect(() => assertEmbedding(Float32Array.from({ length: 512 }, () => 1))).toThrow('norm');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { FaceEngineError } from '../errors';
import { OnnxFaceEngine, letterboxRgba, type InferenceSessionLike, type TensorValue } from '../onnx/engine';
import { DETECTOR, MODEL_ID, RECOGNISER } from '../onnx/models';
import { assertEmbedding } from '../onnx/tensor';

describe('letterboxRgba', () => {
  it('correctly rescales and letterboxes dimensions', () => {
    const width = 100;
    const height = 50;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 128;
      rgba[i * 4 + 2] = 64;
      rgba[i * 4 + 3] = 255;
    }

    const result = letterboxRgba(rgba, width, height, 640);
    expect(result.width).toBe(640);
    expect(result.height).toBe(640);
    expect(result.detScale).toBe(6.4);
    expect(result.rgba.length).toBe(640 * 640 * 4);
  });
});

describe('OnnxFaceEngine', () => {
  function createMockSessions() {
    const detectorRun = vi.fn<InferenceSessionLike['run']>();
    const recogniserRun = vi.fn<InferenceSessionLike['run']>();

    const sessionFactory = vi.fn(async (path: string): Promise<InferenceSessionLike> => {
      if (path.includes('det_10g')) {
        return { run: detectorRun };
      }
      return { run: recogniserRun };
    });

    return { detectorRun, recogniserRun, sessionFactory };
  }

  function mockScrfdOutputs(faceCount = 1) {
    const outputs: Record<string, TensorValue> = {
      '448': { data: new Float32Array(12800), dims: [12800] },
      '471': { data: new Float32Array(3200), dims: [3200] },
      '494': { data: new Float32Array(800), dims: [800] },
      '451': { data: new Float32Array(12800 * 4), dims: [12800, 4] },
      '474': { data: new Float32Array(3200 * 4), dims: [3200, 4] },
      '497': { data: new Float32Array(800 * 4), dims: [800, 4] },
      '454': { data: new Float32Array(12800 * 10), dims: [12800, 10] },
      '477': { data: new Float32Array(3200 * 10), dims: [3200, 10] },
      '500': { data: new Float32Array(800 * 10), dims: [800, 10] },
    };

    if (faceCount >= 1) {
      // First face in stride 8, anchor 0
      outputs['448']!.data[0] = 0.95; // score
      outputs['451']!.data[0] = 5; // dist l
      outputs['451']!.data[1] = 5; // dist t
      outputs['451']!.data[2] = 5; // dist r
      outputs['451']!.data[3] = 5; // dist b

      // 5 landmarks (kps)
      const kps = [
        38.29 / 8, 51.69 / 8, // left eye
        73.53 / 8, 51.50 / 8, // right eye
        56.02 / 8, 71.74 / 8, // nose
        41.55 / 8, 92.37 / 8, // left mouth
        70.73 / 8, 92.20 / 8, // right mouth
      ];
      for (let i = 0; i < 10; i += 1) {
        outputs['454']!.data[i] = kps[i]!;
      }
    }

    if (faceCount >= 2) {
      // Second face in stride 8, anchor 500
      outputs['448']!.data[500] = 0.92;
      outputs['451']!.data[500 * 4] = 10;
      outputs['451']!.data[500 * 4 + 1] = 10;
      outputs['451']!.data[500 * 4 + 2] = 10;
      outputs['451']!.data[500 * 4 + 3] = 10;
      for (let i = 0; i < 10; i += 1) {
        outputs['454']!.data[500 * 10 + i] = 10 + i;
      }
    }

    return outputs;
  }

  it('runs detection and ArcFace embedding pipeline end-to-end', async () => {
    const { detectorRun, recogniserRun, sessionFactory } = createMockSessions();

    detectorRun.mockResolvedValue(mockScrfdOutputs(1));

    const rawEmbedding = new Float32Array(512);
    for (let i = 0; i < 512; i += 1) {
      rawEmbedding[i] = Math.sin(i + 1);
    }
    recogniserRun.mockResolvedValue({
      '683': { data: rawEmbedding, dims: [1, 512] },
    });

    const engine = new OnnxFaceEngine({
      detectorPath: '/models/det_10g.onnx',
      recogniserPath: '/models/w600k_r50.onnx',
      sessionFactory,
    });

    const initResult = await engine.init();
    expect(initResult.modelId).toBe(MODEL_ID);
    expect(initResult.modelVerified).toBe(true);

    const testRgba = new Uint8Array(200 * 200 * 4);
    for (let i = 0; i < 200 * 200; i += 1) {
      testRgba[i * 4] = 180;
      testRgba[i * 4 + 1] = 150;
      testRgba[i * 4 + 2] = 130;
      testRgba[i * 4 + 3] = 255;
    }

    const result = await engine.embed({
      rgba: testRgba,
      width: 200,
      height: 200,
    });

    expect(result.modelId).toBe(MODEL_ID);
    expect(result.embedding.length).toBe(512);
    assertEmbedding(result.embedding);
    expect(result.quality.score).toBeGreaterThan(0);
    expect(detectorRun).toHaveBeenCalledTimes(1);
    expect(recogniserRun).toHaveBeenCalledTimes(1);
  });

  it('throws NO_FACE when detector finds 0 faces', async () => {
    const { detectorRun, sessionFactory } = createMockSessions();
    detectorRun.mockResolvedValue(mockScrfdOutputs(0));

    const engine = new OnnxFaceEngine({
      detectorPath: '/models/det_10g.onnx',
      recogniserPath: '/models/w600k_r50.onnx',
      sessionFactory,
    });

    const testRgba = new Uint8Array(100 * 100 * 4);
    await expect(
      engine.embed({ rgba: testRgba, width: 100, height: 100 }),
    ).rejects.toThrow(FaceEngineError);
  });

  it('throws MULTIPLE_FACES when detector finds multiple faces', async () => {
    const { detectorRun, sessionFactory } = createMockSessions();
    detectorRun.mockResolvedValue(mockScrfdOutputs(2));

    const engine = new OnnxFaceEngine({
      detectorPath: '/models/det_10g.onnx',
      recogniserPath: '/models/w600k_r50.onnx',
      sessionFactory,
    });

    const testRgba = new Uint8Array(100 * 100 * 4);
    await expect(
      engine.embed({ rgba: testRgba, width: 100, height: 100 }),
    ).rejects.toThrow(/Multiple faces/);
  });
});

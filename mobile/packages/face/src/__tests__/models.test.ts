import { describe, expect, it } from 'vitest';

import { DETECTOR, MODEL_ID, RECOGNISER, modelUrl } from '../onnx/models';

describe('verified InsightFace model registry', () => {
  it('pins the verified SCRFD detector contract', () => {
    expect(DETECTOR).toEqual({
      key: 'det_10g',
      fileName: 'det_10g.onnx',
      bytes: 16_923_827,
      sha256: '5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91',
      inputName: 'input.1',
      outputNames: ['448', '471', '494', '451', '474', '497', '454', '477', '500'],
    });
    expect(DETECTOR.inputName).toBe('input.1');
    expect(DETECTOR.outputNames).toEqual(['448', '471', '494', '451', '474', '497', '454', '477', '500']);
  });

  it('pins the verified ArcFace recogniser contract and model identity', () => {
    expect(RECOGNISER).toEqual({
      key: 'w600k_r50',
      fileName: 'w600k_r50.onnx',
      bytes: 174_383_860,
      sha256: '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43',
      inputName: 'input.1',
      outputNames: ['683'],
    });
    expect(RECOGNISER.outputNames).toEqual(['683']);
    expect(RECOGNISER.sha256).toBe('4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43');
    expect(MODEL_ID).toBe('insightface/w600k_r50@1');
  });

  it('builds model URLs without a duplicate separator', () => {
    expect(modelUrl(DETECTOR, 'http://10.0.2.2:8765')).toBe('http://10.0.2.2:8765/det_10g.onnx');
    expect(modelUrl(RECOGNISER, 'http://10.0.2.2:8765/')).toBe('http://10.0.2.2:8765/w600k_r50.onnx');
  });
});

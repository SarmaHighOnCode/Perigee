import { describe, expect, it } from 'vitest';
import { fixtureVector, MODEL_ID } from '@perigee/face';

import { prepareSearch } from './prepareSearch';

describe('prepareSearch', () => {
  it('prepares single sample search payload', () => {
    const embedding = fixtureVector(20260810);
    const result = prepareSearch([
      {
        embedding,
        quality: { score: 0.9, detScore: 0.95, blur: 120, yaw: 0, pitch: 0, facePx: 200 },
        modelId: MODEL_ID,
      },
    ]);

    expect(result.model_id).toBe(MODEL_ID);
    expect(result.embedding).toHaveLength(512);
    expect(result.quality.score).toBe(0.9);
  });

  it('aggregates multi-sample search payload', () => {
    const vecA = fixtureVector(20260810);
    const vecB = fixtureVector(20260810);
    const result = prepareSearch([
      {
        embedding: vecA,
        quality: { score: 0.85, detScore: 0.9, blur: 110, yaw: -5, pitch: 2, facePx: 180 },
        modelId: MODEL_ID,
      },
      {
        embedding: vecB,
        quality: { score: 0.92, detScore: 0.96, blur: 130, yaw: 3, pitch: -1, facePx: 190 },
        modelId: MODEL_ID,
      },
    ]);

    expect(result.model_id).toBe(MODEL_ID);
    expect(result.embedding).toHaveLength(512);
    expect(result.quality.score).toBe(0.85); // worst of included samples
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fixtureVector, MODEL_ID, type FaceEngine } from '@perigee/face';

import { embedCapture } from './embedCapture';

describe('embedCapture', () => {
  it('embeds capture and enforces enrollment quality floor', async () => {
    const mockEngine: FaceEngine = {
      modelId: MODEL_ID,
      provider: 'fixture',
      init: vi.fn().mockResolvedValue({ modelId: MODEL_ID, provider: 'fixture', initMs: 1, modelVerified: true }),
      embed: vi.fn().mockResolvedValue({
        embedding: fixtureVector(20260810),
        modelId: MODEL_ID,
        quality: { score: 0.85, detScore: 0.95, blur: 120, yaw: 0, pitch: 0, facePx: 200 },
        latencyMs: 10,
      }),
      assessQuality: vi.fn(),
      selfTest: vi.fn(),
    };

    const result = await embedCapture('file:///test.jpg', mockEngine);
    expect(result.modelId).toBe(MODEL_ID);
    expect(result.embedding).toHaveLength(512);
    expect(result.quality.score).toBe(0.85);
  });

  it('rejects capture below 0.60 floor', async () => {
    const mockEngine: FaceEngine = {
      modelId: MODEL_ID,
      provider: 'fixture',
      init: vi.fn().mockResolvedValue({ modelId: MODEL_ID, provider: 'fixture', initMs: 1, modelVerified: true }),
      embed: vi.fn().mockResolvedValue({
        embedding: fixtureVector(20260810),
        modelId: MODEL_ID,
        quality: { score: 0.45, detScore: 0.7, blur: 70, yaw: 20, pitch: 10, facePx: 120 },
        latencyMs: 10,
      }),
      assessQuality: vi.fn(),
      selfTest: vi.fn(),
    };

    await expect(embedCapture('file:///test.jpg', mockEngine)).rejects.toThrow(/below the enrollment floor/);
  });
});

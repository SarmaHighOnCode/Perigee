import type { FaceEngine, QualityReport } from '@perigee/face';

import { getFaceEngine } from './faceEngine';

export interface ProcessedProbe {
  embedding: Float32Array;
  quality: QualityReport;
  modelId: string;
  latencyMs: number;
}

export async function processProbe(
  uri: string,
  engine: FaceEngine = getFaceEngine(),
): Promise<ProcessedProbe> {
  const result = await engine.embed({ uri });
  return {
    embedding: result.embedding,
    quality: result.quality,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
  };
}

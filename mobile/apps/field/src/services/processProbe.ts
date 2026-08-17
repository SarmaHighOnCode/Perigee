import { createFaceEngine } from '@perigee/face';
import type { EmbedResult, FaceEngine, QualityReport } from '@perigee/face';

export interface ProcessedProbe {
  embedding: Float32Array;
  quality: QualityReport;
  modelId: string;
  latencyMs: number;
}

export async function processProbe(
  uri: string,
  engine: FaceEngine = createFaceEngine(),
): Promise<ProcessedProbe> {
  const result = await engine.embed({ uri });
  return {
    embedding: result.embedding,
    quality: result.quality,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
  };
}

import { createFaceEngine } from '@perigee/face';
import type { FaceEngine, QualityReport } from '@perigee/face';

export const ENROLLMENT_QUALITY_FLOOR = 0.60;

export interface EmbedCaptureResult {
  embedding: Float32Array;
  quality: QualityReport;
  modelId: string;
  latencyMs: number;
}

export async function embedCapture(
  uri: string,
  engine: FaceEngine = createFaceEngine(),
  qualityFloor = ENROLLMENT_QUALITY_FLOOR,
): Promise<EmbedCaptureResult> {
  const result = await engine.embed({ uri });

  if (result.quality.score < qualityFloor) {
    throw new Error(
      `Capture quality score (${result.quality.score.toFixed(2)}) is below the enrollment floor (${qualityFloor.toFixed(2)})`,
    );
  }

  return {
    embedding: result.embedding,
    quality: result.quality,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
  };
}

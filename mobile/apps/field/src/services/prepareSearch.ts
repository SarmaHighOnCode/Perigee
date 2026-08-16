import { aggregateEmbeddings, assertEmbedding, l2Normalise, MODEL_ID } from '@perigee/face';
import type { QualityReport } from '@perigee/face';
import type { Quality, SearchRequest } from '@perigee/api-client';

export interface ProbeSample {
  embedding: Float32Array;
  quality: QualityReport;
  modelId: string;
}

export interface PreparedSearchPayload {
  embedding: number[];
  model_id: string;
  quality: Quality;
}

export function prepareSearch(
  samples: readonly ProbeSample[],
): PreparedSearchPayload {
  if (samples.length === 0) {
    throw new Error('At least one probe sample is required to prepare search');
  }

  for (const sample of samples) {
    if (sample.modelId !== MODEL_ID) {
      throw new Error(`Incompatible modelId in probe sample: expected ${MODEL_ID}, received ${sample.modelId}`);
    }
  }

  if (samples.length === 1) {
    const single = samples[0]!;
    assertEmbedding(single.embedding);
    const normalised = l2Normalise(single.embedding);
    return {
      embedding: Array.from(normalised),
      model_id: single.modelId,
      quality: {
        score: single.quality.score,
        det_score: single.quality.detScore,
        blur: single.quality.blur,
        yaw: single.quality.yaw,
        pitch: single.quality.pitch,
        face_px: single.quality.facePx,
      },
    };
  }

  const aggregate = aggregateEmbeddings(samples);
  return {
    embedding: Array.from(aggregate.embedding),
    model_id: MODEL_ID,
    quality: {
      score: aggregate.quality.score,
      det_score: aggregate.quality.detScore,
      blur: aggregate.quality.blur,
      yaw: aggregate.quality.yaw,
      pitch: aggregate.quality.pitch,
      face_px: aggregate.quality.facePx,
    },
  };
}

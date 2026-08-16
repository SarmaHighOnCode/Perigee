export type FaceEngineErrorCode =
  | 'IMAGE_READ_FAILED'
  | 'IMAGE_DECODE_FAILED'
  | 'PIXEL_READ_FAILED'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'QUALITY_TOO_LOW'
  | 'INVALID_EMBEDDING'
  | 'MODEL_UNAVAILABLE'
  | 'SESSION_CREATION_FAILED'
  | 'INFERENCE_FAILED';

export class FaceEngineError extends Error {
  readonly code: FaceEngineErrorCode;

  constructor(code: FaceEngineErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FaceEngineError';
    this.code = code;
  }
}

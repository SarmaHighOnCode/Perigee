export type FaceEngineErrorCode =
  | 'IMAGE_READ_FAILED'
  | 'IMAGE_DECODE_FAILED'
  | 'PIXEL_READ_FAILED';

export class FaceEngineError extends Error {
  readonly code: FaceEngineErrorCode;

  constructor(code: FaceEngineErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FaceEngineError';
    this.code = code;
  }
}

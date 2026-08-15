export interface ModelSpec {
  readonly key: 'det_10g' | 'w600k_r50';
  readonly fileName: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly inputName: 'input.1';
  readonly outputNames: readonly string[];
}

export const MODEL_ID = 'insightface/w600k_r50@1';
export const DEFAULT_MODEL_BASE_URL = 'http://10.0.2.2:8765';

export const DETECTOR: ModelSpec = Object.freeze({
  key: 'det_10g',
  fileName: 'det_10g.onnx',
  bytes: 16_923_827,
  sha256: '5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91',
  inputName: 'input.1',
  outputNames: Object.freeze(['448', '471', '494', '451', '474', '497', '454', '477', '500']),
});

export const RECOGNISER: ModelSpec = Object.freeze({
  key: 'w600k_r50',
  fileName: 'w600k_r50.onnx',
  bytes: 174_383_860,
  sha256: '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43',
  inputName: 'input.1',
  outputNames: Object.freeze(['683']),
});

export function modelBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_MODEL_BASE_URL;
  if (configured === undefined) {
    return DEFAULT_MODEL_BASE_URL;
  }

  const trimmed = configured.trim();
  if (trimmed.length === 0) {
    throw new Error('EXPO_PUBLIC_MODEL_BASE_URL must be a non-empty HTTP(S) URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('EXPO_PUBLIC_MODEL_BASE_URL must be a valid HTTP(S) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_MODEL_BASE_URL must use HTTP or HTTPS');
  }

  return trimmed.replace(/\/+$/, '');
}

export function modelUrl(spec: ModelSpec, baseUrl = modelBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}/${spec.fileName}`;
}

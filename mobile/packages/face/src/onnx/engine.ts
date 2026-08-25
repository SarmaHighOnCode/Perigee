import { FaceEngineError } from '../errors';
import { createSkiaImageCodec, type DecodedImage, type ImageCodec } from '../native/decodeImage';
import { assessQuality } from '../quality';
import type {
  EmbedResult,
  FaceEngine,
  FaceInput,
  InitResult,
  QualityReport,
  SelfTestReport,
} from '../types';
import type { SelfTestPair } from '../selftest';
import { aggregateEmbeddings } from './aggregate';
import { ARCFACE_TEMPLATE, estimateSimilarityTransform, warpRgba } from './align';
import { ensureModel, type ModelFileAdapter } from './model-cache';
import { DETECTOR, MODEL_ID, RECOGNISER } from './models';
import { decodeDetections, type FaceDetection } from './scrfd';
import { toQualitySignals } from './signals';
import {
  assertEmbedding,
  cosineSimilarity,
  l2Normalise,
  l2Norm,
  rgbaToRgbNchw,
} from './tensor';

export interface TensorValue {
  data: Float32Array;
  dims: readonly number[];
}

export interface InferenceSessionLike {
  run(feeds: Record<string, TensorValue>): Promise<Record<string, TensorValue>>;
  release?(): Promise<void>;
}

export type SessionFactory = (
  modelPath: string,
  options?: { executionProviders?: readonly string[] },
) => Promise<InferenceSessionLike>;

export interface OnnxFaceEngineOptions {
  detectorPath?: string;
  recogniserPath?: string;
  sessionFactory?: SessionFactory;
  codec?: ImageCodec;
  files?: ModelFileAdapter;
  baseUrl?: string;
  clock?: () => number;
  qualityFloor?: number;
  executionProviders?: readonly string[];
  /**
   * 'reject-multiple' (default) throws MULTIPLE_FACES when several faces are
   * detected. 'largest' keeps the dominant (largest) face instead — used by
   * enrollment, where bystanders at the frame edge must not block the capture.
   */
  faceSelector?: 'reject-multiple' | 'largest';
}

export interface LetterboxedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
  detScale: number;
}

function pickDominantFace(detections: readonly FaceDetection[]): FaceDetection {
  let dominant = detections[0]!;
  let dominantArea = (dominant.x2 - dominant.x1) * (dominant.y2 - dominant.y1);
  for (const candidate of detections) {
    const area = (candidate.x2 - candidate.x1) * (candidate.y2 - candidate.y1);
    if (area > dominantArea) {
      dominant = candidate;
      dominantArea = area;
    }
  }
  return dominant;
}

const DETECTOR_SIZE = 640;
const RECOGNISER_SIZE = 112;
const DETECTOR_MEAN = 127.5;
const DETECTOR_SCALE = 1.0 / 128.0;
const RECOGNISER_MEAN = 127.5;
const RECOGNISER_SCALE = 1.0 / 127.5;

export function letterboxRgba(
  sourceRgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetSize = DETECTOR_SIZE,
): LetterboxedImage {
  const detScale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const scaledWidth = Math.min(targetSize, Math.max(1, Math.round(sourceWidth * detScale)));
  const scaledHeight = Math.min(targetSize, Math.max(1, Math.round(sourceHeight * detScale)));

  const target = new Uint8Array(targetSize * targetSize * 4);

  for (let y = 0; y < scaledHeight; y += 1) {
    const srcY = y / detScale;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const yWeight = srcY - y0;

    for (let x = 0; x < scaledWidth; x += 1) {
      const srcX = x / detScale;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const xWeight = srcX - x0;

      const targetOffset = (y * targetSize + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          sourceRgba[(y0 * sourceWidth + x0) * 4 + channel]! * (1 - xWeight) +
          sourceRgba[(y0 * sourceWidth + x1) * 4 + channel]! * xWeight;
        const bottom =
          sourceRgba[(y1 * sourceWidth + x0) * 4 + channel]! * (1 - xWeight) +
          sourceRgba[(y1 * sourceWidth + x1) * 4 + channel]! * xWeight;

        const val = Math.round(top * (1 - yWeight) + bottom * yWeight);
        target[targetOffset + channel] = Math.max(0, Math.min(255, val));
      }
    }
  }

  return { rgba: target, width: targetSize, height: targetSize, detScale };
}

export class OnnxFaceEngine implements FaceEngine {
  readonly modelId = MODEL_ID;
  private readonly options: OnnxFaceEngineOptions;
  private readonly clock: () => number;
  private readonly codec: ImageCodec;
  private detectorSession: InferenceSessionLike | null = null;
  private recogniserSession: InferenceSessionLike | null = null;
  private initPromise: Promise<InitResult> | null = null;
  private activeProvider = 'cpu';

  constructor(options: OnnxFaceEngineOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? (() => Date.now());
    this.codec = options.codec ?? createSkiaImageCodec();
  }

  get provider(): string {
    return this.activeProvider;
  }

  async init(): Promise<InitResult> {
    if (this.detectorSession && this.recogniserSession) {
      return {
        modelId: this.modelId,
        provider: this.activeProvider,
        initMs: 0,
        modelVerified: true,
      };
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInit();
    try {
      return await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      this.detectorSession = null;
      this.recogniserSession = null;
      throw error;
    }
  }

  private async doInit(): Promise<InitResult> {
    const started = this.clock();
    let sessionFactory = this.options.sessionFactory;

    if (!sessionFactory) {
      const ort = await import('onnxruntime-react-native');
      sessionFactory = (path, opts) =>
        ort.InferenceSession.create(path, {
          executionProviders: (opts?.executionProviders ?? ['cpu']) as readonly ['cpu'],
        }) as unknown as Promise<InferenceSessionLike>;
    }

    let detectorPath = this.options.detectorPath;
    let recogniserPath = this.options.recogniserPath;

    if ((!detectorPath || !recogniserPath) && this.options.baseUrl) {
      const files = this.options.files ?? (await import('./native-model-files')).nativeModelFiles;
      detectorPath = await ensureModel(DETECTOR, this.options.baseUrl, files);
      recogniserPath = await ensureModel(RECOGNISER, this.options.baseUrl, files);
    }

    if (!detectorPath || !recogniserPath) {
      throw new FaceEngineError(
        'MODEL_UNAVAILABLE',
        'Model paths or model cache files are not configured for OnnxFaceEngine',
      );
    }

    const providers = this.options.executionProviders ?? ['cpu'];
    try {
      this.detectorSession = await sessionFactory(detectorPath, {
        executionProviders: providers,
      });
      this.recogniserSession = await sessionFactory(recogniserPath, {
        executionProviders: providers,
      });
      this.activeProvider = providers[0] ?? 'cpu';
    } catch (error) {
      throw new FaceEngineError(
        'SESSION_CREATION_FAILED',
        `Failed to create ONNX inference sessions: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    return {
      modelId: this.modelId,
      provider: this.activeProvider,
      initMs: this.clock() - started,
      modelVerified: true,
    };
  }

  async embedUri(uri: string): Promise<EmbedResult> {
    return this.embed({ uri });
  }

  async embed(input: FaceInput): Promise<EmbedResult> {
    const started = this.clock();
    await this.init();

    if (!this.detectorSession || !this.recogniserSession) {
      throw new FaceEngineError('SESSION_CREATION_FAILED', 'Inference sessions not initialized');
    }

    let decoded: DecodedImage;
    if (input.uri) {
      decoded = await this.codec.decode(input.uri);
    } else if (input.rgba && input.width && input.height) {
      decoded = { rgba: input.rgba, width: input.width, height: input.height };
    } else if (input.frame && input.width && input.height) {
      const bufferView = input.frame;
      const rgba = new Uint8Array(
        bufferView.buffer,
        bufferView.byteOffset,
        bufferView.byteLength,
      );
      decoded = { rgba, width: input.width, height: input.height };
    } else {
      throw new FaceEngineError(
        'IMAGE_READ_FAILED',
        'FaceInput must provide a uri, rgba buffer, or frame with width and height',
      );
    }

    const letterboxed = letterboxRgba(decoded.rgba, decoded.width, decoded.height, DETECTOR_SIZE);
    const detectorInputTensor = rgbaToRgbNchw(
      letterboxed.rgba,
      DETECTOR_SIZE,
      DETECTOR_SIZE,
      DETECTOR_MEAN,
      DETECTOR_SCALE,
    );

    let detectorRunOutputs: Record<string, TensorValue>;
    try {
      detectorRunOutputs = await this.detectorSession.run({
        'input.1': {
          data: detectorInputTensor,
          dims: [1, 3, DETECTOR_SIZE, DETECTOR_SIZE],
        },
      });
    } catch (error) {
      throw new FaceEngineError(
        'INFERENCE_FAILED',
        `Detector inference failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    const detectorOutputsRecord: Record<string, Float32Array> = {};
    for (const headName of DETECTOR.outputNames) {
      const output = detectorRunOutputs[headName];
      if (!output) {
        throw new FaceEngineError(
          'INFERENCE_FAILED',
          `Detector output head ${headName} missing from session output`,
        );
      }
      detectorOutputsRecord[headName] = output.data;
    }

    const detections = decodeDetections(detectorOutputsRecord, letterboxed.detScale);

    if (detections.length === 0) {
      throw new FaceEngineError('NO_FACE', 'No face detected in frame');
    }
    if (detections.length > 1 && this.options.faceSelector !== 'largest') {
      throw new FaceEngineError(
        'MULTIPLE_FACES',
        `Multiple faces (${detections.length}) detected in frame`,
      );
    }

    const face = pickDominantFace(detections);
    const transform = estimateSimilarityTransform(face.landmarks, ARCFACE_TEMPLATE);
    const alignedRgba = warpRgba(
      decoded.rgba,
      decoded.width,
      decoded.height,
      transform,
      RECOGNISER_SIZE,
      RECOGNISER_SIZE,
    );

    const signals = toQualitySignals(face, alignedRgba, detections.length);
    const quality = assessQuality(signals);

    const recogniserInputTensor = rgbaToRgbNchw(
      alignedRgba,
      RECOGNISER_SIZE,
      RECOGNISER_SIZE,
      RECOGNISER_MEAN,
      RECOGNISER_SCALE,
    );

    let recogniserRunOutputs: Record<string, TensorValue>;
    try {
      recogniserRunOutputs = await this.recogniserSession.run({
        'input.1': {
          data: recogniserInputTensor,
          dims: [1, 3, RECOGNISER_SIZE, RECOGNISER_SIZE],
        },
      });
    } catch (error) {
      throw new FaceEngineError(
        'INFERENCE_FAILED',
        `Recogniser inference failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    const output683 = recogniserRunOutputs['683'];
    if (!output683) {
      throw new FaceEngineError(
        'INFERENCE_FAILED',
        'Recogniser output 683 missing from session output',
      );
    }

    if (output683.data.length !== 512) {
      throw new FaceEngineError(
        'INFERENCE_FAILED',
        `Recogniser output must contain 512 floats, received ${output683.data.length}`,
      );
    }

    const embedding = l2Normalise(output683.data);
    assertEmbedding(embedding);

    return {
      embedding,
      modelId: this.modelId,
      quality,
      latencyMs: this.clock() - started,
    };
  }

  assessQuality(input: FaceInput): QualityReport {
    if (input.signals) {
      return assessQuality(input.signals);
    }
    throw new FaceEngineError(
      'IMAGE_READ_FAILED',
      'Quality signals are required when assessing quality synchronously without pixels',
    );
  }

  /**
   * Pairs are REQUIRED to pass. Called bare — as the FaceEngine interface
   * allows — this reports `passed: false` with "the engine was never
   * exercised", because that is the truth: no image reached the model.
   */
  async selfTest(pairs: readonly SelfTestPair[] = []): Promise<SelfTestReport> {
    const { runSelfTest } = await import('../selftest');
    return runSelfTest(this, pairs);
  }
}

export function createOnnxFaceEngine(options: OnnxFaceEngineOptions = {}): FaceEngine {
  return new OnnxFaceEngine(options);
}

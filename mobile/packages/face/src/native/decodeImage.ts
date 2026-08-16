import { FaceEngineError } from '../errors';

export interface DecodedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}

export interface ImageCodec {
  decode(uri: string): Promise<DecodedImage>;
}

interface DisposableNativeObject {
  dispose(): void;
}

interface SkiaImageLike extends DisposableNativeObject {
  width(): number;
  height(): number;
  readPixels(
    x: number,
    y: number,
    info: {
      colorType: number;
      alphaType: number;
      width: number;
      height: number;
    },
  ): Float32Array | Uint8Array | null;
}

interface SkiaModuleLike {
  AlphaType: { Unpremul: number };
  ColorType: { RGBA_8888: number };
  Skia: {
    Data: {
      fromURI(uri: string): Promise<DisposableNativeObject | null | undefined>;
    };
    Image: {
      MakeImageFromEncoded(data: DisposableNativeObject): SkiaImageLike | null;
    };
  };
}

export type SkiaModuleLoader = () => Promise<SkiaModuleLike>;

const loadInstalledSkia: SkiaModuleLoader = async () => (
  await import('@shopify/react-native-skia') as unknown as SkiaModuleLike
);

function pixelReadError(message: string, cause?: unknown): FaceEngineError {
  return new FaceEngineError('PIXEL_READ_FAILED', message, cause);
}

function expectedRgbaBytes(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || width <= 0
    || !Number.isSafeInteger(height) || height <= 0) {
    throw pixelReadError(`Invalid decoded image dimensions: ${width} x ${height}`);
  }

  const pixelCount = width * height;
  const byteCount = pixelCount * 4;
  if (!Number.isSafeInteger(pixelCount) || !Number.isSafeInteger(byteCount)) {
    throw pixelReadError(`Decoded image dimensions are too large: ${width} x ${height}`);
  }
  return byteCount;
}

function validateDecodedImage(image: DecodedImage | null | undefined): DecodedImage {
  if (image === null || image === undefined) {
    throw pixelReadError('Decoded image data is unavailable');
  }

  const expectedBytes = expectedRgbaBytes(image.width, image.height);
  if (!(image.rgba instanceof Uint8Array) || image.rgba.byteLength !== expectedBytes) {
    throw pixelReadError(
      `Invalid RGBA buffer length: expected ${expectedBytes}, received ${image.rgba?.byteLength ?? 0}`,
    );
  }

  return image;
}

function disposeQuietly(object: DisposableNativeObject | null | undefined): void {
  try {
    object?.dispose();
  } catch {
    // Cleanup must not replace the typed decode failure that triggered it.
  }
}

export function createSkiaImageCodec(
  loadSkia: SkiaModuleLoader = loadInstalledSkia,
): ImageCodec {
  return {
    async decode(uri: string): Promise<DecodedImage> {
      let skia: SkiaModuleLike;
      let data: DisposableNativeObject | null | undefined;
      try {
        skia = await loadSkia();
        data = await skia.Skia.Data.fromURI(uri);
      } catch (error) {
        throw new FaceEngineError(
          'IMAGE_READ_FAILED',
          `Unable to read image URI: ${uri}`,
          error,
        );
      }

      if (data === null || data === undefined) {
        throw new FaceEngineError('IMAGE_READ_FAILED', `No image data was read from URI: ${uri}`);
      }

      let image: SkiaImageLike | null = null;
      try {
        try {
          image = skia.Skia.Image.MakeImageFromEncoded(data);
        } catch (error) {
          throw new FaceEngineError(
            'IMAGE_DECODE_FAILED',
            `Unable to decode image data from URI: ${uri}`,
            error,
          );
        }

        if (image === null) {
          throw new FaceEngineError(
            'IMAGE_DECODE_FAILED',
            `Unsupported or invalid encoded image at URI: ${uri}`,
          );
        }

        const width = image.width();
        const height = image.height();
        expectedRgbaBytes(width, height);

        let rgba: Float32Array | Uint8Array | null;
        try {
          rgba = image.readPixels(0, 0, {
            colorType: skia.ColorType.RGBA_8888,
            alphaType: skia.AlphaType.Unpremul,
            width,
            height,
          });
        } catch (error) {
          throw pixelReadError(`Unable to read decoded pixels from URI: ${uri}`, error);
        }

        if (!(rgba instanceof Uint8Array)) {
          throw pixelReadError(`RGBA pixel data is unavailable for URI: ${uri}`);
        }

        return { rgba, width, height };
      } finally {
        disposeQuietly(image);
        disposeQuietly(data);
      }
    },
  };
}

export async function decodeImage(
  uri: string,
  codec: ImageCodec = createSkiaImageCodec(),
): Promise<DecodedImage> {
  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(uri);
  } catch (error) {
    if (error instanceof FaceEngineError) throw error;
    throw new FaceEngineError('IMAGE_READ_FAILED', `Unable to read image URI: ${uri}`, error);
  }

  const validated = validateDecodedImage(decoded);
  return {
    rgba: new Uint8Array(validated.rgba),
    width: validated.width,
    height: validated.height,
  };
}

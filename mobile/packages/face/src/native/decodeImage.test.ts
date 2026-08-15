import { describe, expect, it } from 'vitest';

import {
  createSkiaImageCodec,
  decodeImage,
  type DecodedImage,
  type ImageCodec,
} from './decodeImage';

function codecReturning(image: DecodedImage | undefined): ImageCodec {
  return {
    async decode() {
      return image as DecodedImage;
    },
  };
}

describe('decodeImage', () => {
  it('copies valid RGBA pixels instead of retaining the codec view', async () => {
    const nativeView = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const decoded = await decodeImage('file:///capture.png', codecReturning({
      rgba: nativeView,
      width: 2,
      height: 1,
    }));
    nativeView.fill(99);

    expect(decoded).toEqual({
      rgba: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      width: 2,
      height: 1,
    });
    expect(decoded.rgba).not.toBe(nativeView);
  });

  it.each([
    { width: 0, height: 1 },
    { width: 1, height: 0 },
  ])('rejects non-positive image dimensions: $width x $height', async ({ width, height }) => {
    await expect(decodeImage('file:///capture.png', codecReturning({
      rgba: new Uint8Array(),
      width,
      height,
    }))).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'PIXEL_READ_FAILED',
    });
  });

  it('rejects a truncated RGBA buffer', async () => {
    await expect(decodeImage('file:///capture.png', codecReturning({
      rgba: new Uint8Array(7),
      width: 2,
      height: 1,
    }))).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'PIXEL_READ_FAILED',
    });
  });

  it('rejects unavailable decoded image data', async () => {
    await expect(
      decodeImage('file:///capture.png', codecReturning(undefined)),
    ).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'PIXEL_READ_FAILED',
    });
  });
});

describe('Skia image codec', () => {
  it('reads exact RGBA8888 unpremultiplied pixels and disposes native objects', async () => {
    const events: string[] = [];
    const pixels = new Uint8Array([10, 20, 30, 255]);
    const data = {
      dispose() {
        events.push('dispose:data');
      },
    };
    const image = {
      width: () => 1,
      height: () => 1,
      readPixels(_x: number, _y: number, info: {
        colorType: number;
        alphaType: number;
        width: number;
        height: number;
      }) {
        events.push('readPixels');
        return info.colorType === 17
          && info.alphaType === 23
          && info.width === 1
          && info.height === 1
          ? pixels
          : null;
      },
      dispose() {
        events.push('dispose:image');
      },
    };
    const codec = createSkiaImageCodec(async () => ({
      AlphaType: { Unpremul: 23 },
      ColorType: { RGBA_8888: 17 },
      Skia: {
        Data: { fromURI: async () => data },
        Image: { MakeImageFromEncoded: () => image },
      },
    }));

    await expect(codec.decode('file:///capture.png')).resolves.toEqual({
      rgba: pixels,
      width: 1,
      height: 1,
    });
    expect(events).toEqual(['readPixels', 'dispose:image', 'dispose:data']);
  });

  it('maps an unavailable URI to IMAGE_READ_FAILED', async () => {
    const codec = createSkiaImageCodec(async () => ({
      AlphaType: { Unpremul: 23 },
      ColorType: { RGBA_8888: 17 },
      Skia: {
        Data: { fromURI: async () => { throw new Error('missing file'); } },
        Image: { MakeImageFromEncoded: () => null },
      },
    }));

    await expect(codec.decode('file:///missing.png')).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'IMAGE_READ_FAILED',
      cause: expect.objectContaining({ message: 'missing file' }),
    });
  });

  it('maps unsupported encoded data to IMAGE_DECODE_FAILED and disposes the data', async () => {
    let disposed = false;
    const data = { dispose: () => { disposed = true; } };
    const codec = createSkiaImageCodec(async () => ({
      AlphaType: { Unpremul: 23 },
      ColorType: { RGBA_8888: 17 },
      Skia: {
        Data: { fromURI: async () => data },
        Image: { MakeImageFromEncoded: () => null },
      },
    }));

    await expect(codec.decode('file:///invalid.png')).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'IMAGE_DECODE_FAILED',
    });
    expect(disposed).toBe(true);
  });

  it('maps unavailable pixel data to PIXEL_READ_FAILED and disposes both native objects', async () => {
    const events: string[] = [];
    const data = { dispose: () => { events.push('dispose:data'); } };
    const image = {
      width: () => 1,
      height: () => 1,
      readPixels: () => null,
      dispose: () => { events.push('dispose:image'); },
    };
    const codec = createSkiaImageCodec(async () => ({
      AlphaType: { Unpremul: 23 },
      ColorType: { RGBA_8888: 17 },
      Skia: {
        Data: { fromURI: async () => data },
        Image: { MakeImageFromEncoded: () => image },
      },
    }));

    await expect(codec.decode('file:///capture.png')).rejects.toMatchObject({
      name: 'FaceEngineError',
      code: 'PIXEL_READ_FAILED',
    });
    expect(events).toEqual(['dispose:image', 'dispose:data']);
  });
});

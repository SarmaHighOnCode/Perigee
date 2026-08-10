import { describe, expect, it } from 'vitest';

import { formatBytes, normalizeMedia } from './metadata';

describe('normalizeMedia', () => {
  it('normalizes a camera file path without recompressing it', () => {
    expect(
      normalizeMedia({
        uri: 'E:/cache/capture.jpg',
        width: 4000,
        height: 3000,
        bytes: 5_242_880,
        mimeType: 'image/jpeg',
        source: 'camera',
        acquiredAt: '2026-08-10T12:00:00.000Z',
      }),
    ).toMatchObject({
      uri: 'file:///E:/cache/capture.jpg',
      width: 4000,
      height: 3000,
      megapixels: 12,
      bytes: 5_242_880,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      source: 'camera',
    });
  });

  it('keeps unknown gallery metadata explicit', () => {
    expect(
      normalizeMedia({
        uri: 'content://picker/image/123',
        source: 'gallery',
        acquiredAt: '2026-08-10T12:00:00.000Z',
      }),
    ).toMatchObject({
      width: null,
      height: null,
      megapixels: null,
      bytes: null,
      mimeType: 'application/octet-stream',
      extension: null,
    });
  });

  it('turns an Android absolute capture path into a file URI', () => {
    expect(
      normalizeMedia({
        uri: '/data/user/0/com.perigee.testcamera/cache/capture.jpeg',
        source: 'camera',
        acquiredAt: '2026-08-10T12:00:00.000Z',
      }).uri,
    ).toBe('file:///data/user/0/com.perigee.testcamera/cache/capture.jpeg');
  });
});

describe('formatBytes', () => {
  it('formats bytes without overstating precision', () => {
    expect(formatBytes(null)).toBe('UNKNOWN');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5_242_880)).toBe('5 MB');
  });
});

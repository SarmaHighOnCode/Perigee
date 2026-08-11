import { describe, expect, it } from 'vitest';

import { formatBytes, normalizeMedia } from './media';

describe('camera media', () => {
  it('normalizes a native path without recompressing media', () => {
    expect(normalizeMedia({
      uri: '/data/user/0/com.perigee.field/cache/capture.jpeg',
      width: 4000, height: 3000, bytes: 5_242_880, mimeType: 'image/jpeg',
      source: 'camera', acquiredAt: '2026-08-11T12:00:00Z',
    })).toMatchObject({
      uri: 'file:///data/user/0/com.perigee.field/cache/capture.jpeg',
      width: 4000, height: 3000, megapixels: 12, bytes: 5_242_880,
      mimeType: 'image/jpeg', extension: 'jpeg', source: 'camera',
    });
  });

  it('keeps unknown picker metadata explicit', () => {
    expect(normalizeMedia({
      uri: 'content://picker/image/123', source: 'gallery', acquiredAt: '2026-08-11T12:00:00Z',
    })).toMatchObject({
      width: null, height: null, megapixels: null, bytes: null,
      mimeType: 'application/octet-stream', extension: null,
    });
  });

  it('formats byte counts without false precision', () => {
    expect(formatBytes(null)).toBe('UNKNOWN');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5_242_880)).toBe('5 MB');
  });
});

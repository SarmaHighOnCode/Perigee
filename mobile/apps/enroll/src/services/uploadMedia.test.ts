import { describe, expect, it } from 'vitest';

import { sanitizeImageBytes } from './uploadMedia';

function bytes(...values: Array<number | number[]>): Uint8Array {
  return new Uint8Array(values.flat());
}

describe('lossless metadata sanitization', () => {
  it('removes JPEG EXIF/APP1 while preserving compressed scan bytes', () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00],
      [0xff, 0xdb, 0x00, 0x04, 0x01, 0x02],
      [0xff, 0xda, 0x00, 0x04, 0x03, 0x04, 0x11, 0x22, 0xff, 0xd9],
    );
    const result = sanitizeImageBytes(jpeg, 'image/jpeg');
    const output = Array.from(new Uint8Array(result.body));
    expect(result.exifStripped).toBe(true);
    expect(new TextDecoder().decode(result.body)).not.toContain('Exif');
    expect(output.slice(-4)).toEqual([0x11, 0x22, 0xff, 0xd9]);
  });

  it('removes PNG eXIf and textual metadata chunks without touching image data', () => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (type: string, data: number[]) => [
      0, 0, 0, data.length,
      ...Array.from(new TextEncoder().encode(type)),
      ...data,
      0, 0, 0, 0,
    ];
    const png = bytes(signature, chunk('eXIf', [1, 2]), chunk('IDAT', [9, 8]), chunk('IEND', []));
    const result = sanitizeImageBytes(png, 'image/png');
    const text = new TextDecoder().decode(result.body);
    expect(text).not.toContain('eXIf');
    expect(text).toContain('IDAT');
    expect(result.exifStripped).toBe(true);
  });

  it('rejects unsupported or malformed image input instead of asserting sanitization', () => {
    expect(() => sanitizeImageBytes(bytes(1, 2, 3), 'image/webp')).toThrow(/JPEG or PNG/);
    expect(() => sanitizeImageBytes(bytes(1, 2, 3), 'image/jpeg')).toThrow(/JPEG/);
  });
});

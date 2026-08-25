import type { EnrollmentCapture } from '../domain/draft';
import type { PreparedCapture } from './submitEnrollment';

function concatenate(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output.buffer as ArrayBuffer;
}

function stripJpegMetadata(input: Uint8Array): ArrayBuffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error('Invalid JPEG image');
  }
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2;
  let foundScan = false;

  while (offset < input.length) {
    const segmentStart = offset;
    if (input[offset] !== 0xff) throw new Error('Invalid JPEG segment marker');
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    if (marker === undefined) throw new Error('Truncated JPEG marker');
    const lengthOffset = offset + 1;

    if (marker === 0xda) {
      parts.push(input.slice(segmentStart));
      foundScan = true;
      break;
    }
    if (marker === 0xd9) {
      parts.push(input.slice(segmentStart, offset + 1));
      foundScan = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.slice(segmentStart, offset + 1));
      offset += 1;
      continue;
    }
    if (lengthOffset + 1 >= input.length) throw new Error('Truncated JPEG segment');
    const length = (input[lengthOffset]! << 8) | input[lengthOffset + 1]!;
    if (length < 2) throw new Error('Invalid JPEG segment length');
    const segmentEnd = lengthOffset + length;
    if (segmentEnd > input.length) throw new Error('Truncated JPEG segment data');

    const metadataMarker = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!metadataMarker) parts.push(input.slice(segmentStart, segmentEnd));
    offset = segmentEnd;
  }

  if (!foundScan) throw new Error('JPEG scan data is missing');
  return concatenate(parts);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function stripPngMetadata(input: Uint8Array): ArrayBuffer {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (input.length < 20 || !signature.every((value, index) => input[index] === value)) {
    throw new Error('Invalid PNG image');
  }
  const removable = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  const parts: Uint8Array[] = [input.slice(0, 8)];
  let offset = 8;
  let foundEnd = false;

  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error('Truncated PNG chunk');
    const length = readUint32(input, offset);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error('Truncated PNG chunk data');
    const type = String.fromCharCode(...input.slice(offset + 4, offset + 8));
    if (!removable.has(type)) parts.push(input.slice(offset, end));
    offset = end;
    if (type === 'IEND') {
      foundEnd = true;
      break;
    }
  }
  if (!foundEnd) throw new Error('PNG end chunk is missing');
  return concatenate(parts);
}

export function sanitizeImageBytes(
  input: Uint8Array,
  mimeType: string,
): { body: ArrayBuffer; exifStripped: true } {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return { body: stripJpegMetadata(input), exifStripped: true };
  }
  if (mimeType === 'image/png') {
    return { body: stripPngMetadata(input), exifStripped: true };
  }
  throw new Error('Enrollment media must be JPEG or PNG');
}

function digestHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Dependency-free ArrayBuffer -> base64, for the Postgres media fallback.
 *
 * File.base64() reads the ORIGINAL file, which still carries the EXIF this
 * module exists to strip - GPS and a device serial that must never reach the
 * server. This encodes the already-sanitized bytes instead. `btoa` is not a
 * reliable global across Hermes/RN versions, so this stays dependency-free
 * rather than assuming it exists.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export async function prepareCaptureForUpload(capture: EnrollmentCapture): Promise<PreparedCapture> {
  const [{ File }, Crypto] = await Promise.all([
    import('expo-file-system'),
    import('expo-crypto'),
  ]);
  const original = await new File(capture.uri).arrayBuffer();
  const sanitized = sanitizeImageBytes(new Uint8Array(original), capture.mimeType ?? '');
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, sanitized.body);
  return {
    body: sanitized.body,
    sha256: digestHex(digest),
    bytes: sanitized.body.byteLength,
    width: capture.width,
    height: capture.height,
    exifStripped: true,
  };
}

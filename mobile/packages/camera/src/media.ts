import type { MediaInput, MediaRecord } from './types';

function normalizeFileUri(uri: string): string {
  if (/^[a-z]+:\/\//i.test(uri)) return uri;
  if (/^[A-Za-z]:[\\/]/.test(uri)) return `file:///${uri.replaceAll('\\', '/')}`;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function extensionFrom(uri: string): string | null {
  const withoutQuery = uri.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? null;
}

export function normalizeMedia(input: MediaInput): MediaRecord {
  const width = input.width ?? null;
  const height = input.height ?? null;
  return {
    uri: normalizeFileUri(input.uri),
    width,
    height,
    megapixels:
      width !== null && height !== null
        ? Number(((width * height) / 1_000_000).toFixed(2))
        : null,
    bytes: input.bytes ?? null,
    mimeType: input.mimeType ?? 'application/octet-stream',
    extension: extensionFrom(input.uri),
    source: input.source,
    acquiredAt: input.acquiredAt,
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return 'UNKNOWN';
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Number(kilobytes.toFixed(1))} KB`;
  return `${Number((kilobytes / 1024).toFixed(1))} MB`;
}

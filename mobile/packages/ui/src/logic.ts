import { bands, type Band, type PaletteColour, type Tone } from '@perigee/design-tokens';

/**
 * The `dataset_mode` field that the backend puts on every response
 * (`backend/app/config.py`). A client cannot render a screen without knowing
 * which one it is looking at.
 */
export type DatasetMode = 'synthetic' | 'real';

/** Number of blocks in a `<QualityMeter>`. Discrete reads as measured. */
export const QUALITY_SEGMENTS = 5;

export const WATERMARK_TEXT = 'SYNTHETIC DATA';

/**
 * Scores are always shown to 4 dp in a tabular face, so 0.6412 and 0.5887 can
 * be compared by column rather than read (docs/07 §2).
 */
export function formatScore(similarity: number): string {
  return similarity.toFixed(4);
}

export function bandTone(band: Band): Tone {
  return bands[band].tone;
}

export function bandColour(band: Band): PaletteColour {
  return bands[band].colour;
}

export function bandLabel(band: Band): string {
  return bands[band].label;
}

/** Quality in 0..1 to a whole number of filled blocks in 0..QUALITY_SEGMENTS. */
export function qualitySegments(quality: number): number {
  if (!Number.isFinite(quality)) return 0;
  const filled = Math.round(quality * QUALITY_SEGMENTS);
  return Math.min(Math.max(filled, 0), QUALITY_SEGMENTS);
}

/**
 * Fill colour for the filled blocks. `warn` is the degraded-quality token in
 * docs/07 §3; `alert` covers the range where a capture should be retaken.
 */
export function qualityTone(filled: number): Tone {
  if (filled >= 4) return 'clear';
  if (filled >= 2) return 'warn';
  return 'alert';
}

/**
 * Initial plus asterisks per remaining character, per word — the shape the
 * backend already returns in `masked_name` (`R***** K****`). Applying it to an
 * already-masked name is a no-op, so a caller can never widen exposure by
 * passing the wrong field.
 */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + '*'.repeat(part.length - 1))
    .join(' ');
}

/**
 * The single condition under which `<SyntheticWatermark>` draws. There is no
 * override: screenshots escape, and a screenshot of this app must never be
 * mistakable for an operational system.
 */
export function isWatermarkVisible(datasetMode: DatasetMode): boolean {
  return datasetMode === 'synthetic';
}

export function watermarkRow(repeat: number): string {
  return Array.from({ length: Math.max(repeat, 0) }, () => WATERMARK_TEXT).join('     ');
}

/** The officer's asserted identity, permanently on screen during a search. */
export function officerChipLabel(officerId: string, context?: string): string {
  const base = `SEARCHING AS ${officerId}`;
  const trimmed = context?.trim() ?? '';
  return trimmed.length > 0 ? `${base} · ${trimmed}` : base;
}

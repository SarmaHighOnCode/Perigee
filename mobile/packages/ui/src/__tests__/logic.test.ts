import { bands, palette, type Band } from '@perigee/design-tokens';
import { describe, expect, it } from 'vitest';

import {
  QUALITY_SEGMENTS,
  WATERMARK_TEXT,
  bandColour,
  bandLabel,
  bandTone,
  formatScore,
  isWatermarkVisible,
  maskName,
  officerChipLabel,
  qualitySegments,
  qualityTone,
  watermarkRow,
  type DatasetMode,
} from '../logic';

const ALL_BANDS: readonly Band[] = ['NO_MATCH', 'WEAK', 'REVIEW', 'STRONG'];

describe('formatScore', () => {
  it('always renders four decimal places', () => {
    expect(formatScore(0.6412)).toBe('0.6412');
    expect(formatScore(0.5887)).toBe('0.5887');
  });

  it('pads short values so scores align by column', () => {
    expect(formatScore(0)).toBe('0.0000');
    expect(formatScore(1)).toBe('1.0000');
    expect(formatScore(0.5)).toBe('0.5000');
  });

  it('produces equal-length strings for every value in range', () => {
    const widths = [0, 0.1, 0.42, 0.58, 0.9999, 1].map((v) => formatScore(v).length);
    expect(new Set(widths).size).toBe(1);
  });

  it('rounds rather than truncates the fifth decimal', () => {
    expect(formatScore(0.64126)).toBe('0.6413');
    expect(formatScore(0.641249)).toBe('0.6412');
  });
});

describe('band mapping', () => {
  it('maps each band to the docs/04 §5 colour', () => {
    expect(bandColour('NO_MATCH')).toBe(palette.clear);
    expect(bandColour('WEAK')).toBe(palette.warn);
    expect(bandColour('REVIEW')).toBe(palette.data);
    expect(bandColour('STRONG')).toBe(palette.alert);
  });

  it('resolves the tone to the same colour', () => {
    for (const band of ALL_BANDS) {
      expect(palette[bandTone(band)]).toBe(bandColour(band));
    }
  });

  it('never labels a band as a match', () => {
    expect(bandLabel('STRONG')).toBe('STRONG CANDIDATE');
    for (const band of ALL_BANDS) {
      expect(bandLabel(band)).not.toBe('MATCH');
      expect(bandLabel(band)).not.toMatch(/MATCH FOUND|IDENTIFIED/);
    }
  });

  it('reads through to the token package rather than duplicating it', () => {
    for (const band of ALL_BANDS) {
      expect(bandLabel(band)).toBe(bands[band].label);
    }
  });
});

describe('qualitySegments', () => {
  it('fills no blocks at zero and every block at one', () => {
    expect(qualitySegments(0)).toBe(0);
    expect(qualitySegments(1)).toBe(QUALITY_SEGMENTS);
  });

  it('quantises to whole blocks', () => {
    expect(qualitySegments(0.2)).toBe(1);
    expect(qualitySegments(0.4)).toBe(2);
    expect(qualitySegments(0.55)).toBe(3);
    expect(qualitySegments(0.78)).toBe(4);
    expect(qualitySegments(0.9)).toBe(5);
  });

  it('only ever returns an integer in 0..5', () => {
    for (let v = -0.5; v <= 1.5; v += 0.05) {
      const filled = qualitySegments(v);
      expect(Number.isInteger(filled)).toBe(true);
      expect(filled).toBeGreaterThanOrEqual(0);
      expect(filled).toBeLessThanOrEqual(QUALITY_SEGMENTS);
    }
  });

  it('clamps out-of-range and non-finite input instead of drawing garbage', () => {
    expect(qualitySegments(-1)).toBe(0);
    expect(qualitySegments(9)).toBe(QUALITY_SEGMENTS);
    expect(qualitySegments(Number.NaN)).toBe(0);
    expect(qualitySegments(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('qualityTone', () => {
  it('escalates as the capture degrades', () => {
    expect(qualityTone(5)).toBe('clear');
    expect(qualityTone(4)).toBe('clear');
    expect(qualityTone(3)).toBe('warn');
    expect(qualityTone(2)).toBe('warn');
    expect(qualityTone(1)).toBe('alert');
    expect(qualityTone(0)).toBe('alert');
  });
});

describe('maskName', () => {
  it('keeps the initial and masks the remainder of each word', () => {
    expect(maskName('Ravi Kumar')).toBe('R*** K****');
  });

  it('is idempotent, so an already-masked name cannot be widened', () => {
    const once = maskName('Ravi Kumar');
    expect(maskName(once)).toBe(once);
    expect(maskName('R***** K****')).toBe('R***** K****');
  });

  it('uppercases the initial, since display type is uppercase', () => {
    expect(maskName('ravi')).toBe('R***');
  });

  it('collapses stray whitespace rather than emitting empty words', () => {
    expect(maskName('  Ravi   Kumar  ')).toBe('R*** K****');
  });

  it('handles single characters and empty input', () => {
    expect(maskName('R')).toBe('R');
    expect(maskName('')).toBe('');
    expect(maskName('   ')).toBe('');
  });

  it('never leaks more than one character per word', () => {
    for (const word of maskName('Ravikumar Subramanian').split(' ')) {
      expect(word.replace(/\*/g, '')).toHaveLength(1);
    }
  });

  it('preserves word length, so the mask still reads as a name', () => {
    expect(maskName('Ravi Kumar')).toHaveLength('Ravi Kumar'.length);
  });
});

describe('isWatermarkVisible', () => {
  it('shows the watermark for synthetic data', () => {
    expect(isWatermarkVisible('synthetic')).toBe(true);
  });

  it('hides it only for a real dataset', () => {
    expect(isWatermarkVisible('real')).toBe(false);
  });

  it('is true for every mode that is not exactly "real"', () => {
    const modes: readonly DatasetMode[] = ['synthetic', 'real'];
    expect(modes.filter(isWatermarkVisible)).toEqual(['synthetic']);
  });
});

describe('watermarkRow', () => {
  it('repeats the phrase the requested number of times', () => {
    expect(watermarkRow(3).split(WATERMARK_TEXT)).toHaveLength(4);
  });

  it('says SYNTHETIC DATA in plain words', () => {
    expect(WATERMARK_TEXT).toBe('SYNTHETIC DATA');
    expect(watermarkRow(1)).toBe('SYNTHETIC DATA');
  });

  it('degrades to an empty row rather than throwing', () => {
    expect(watermarkRow(0)).toBe('');
    expect(watermarkRow(-2)).toBe('');
  });
});

describe('officerChipLabel', () => {
  it('states the officer the search is attributed to', () => {
    expect(officerChipLabel('OFFICER-1147')).toBe('SEARCHING AS OFFICER-1147');
  });

  it('appends the stated context', () => {
    expect(officerChipLabel('OFFICER-1147', 'ROUTINE CHECK')).toBe(
      'SEARCHING AS OFFICER-1147 · ROUTINE CHECK',
    );
  });

  it('omits an empty or blank context', () => {
    expect(officerChipLabel('OFFICER-1147', '')).toBe('SEARCHING AS OFFICER-1147');
    expect(officerChipLabel('OFFICER-1147', '   ')).toBe('SEARCHING AS OFFICER-1147');
  });
});

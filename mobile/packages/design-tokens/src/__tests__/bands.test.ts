import { describe, expect, it } from 'vitest';

import { AA, bands, contrastRatio, palette, type Band } from '../index';

const ALL: readonly Band[] = ['NO_MATCH', 'WEAK', 'REVIEW', 'STRONG'];

describe('bands', () => {
  it('covers the four bands the backend emits', () => {
    expect(Object.keys(bands).sort()).toEqual([...ALL].sort());
  });

  it('maps each band to the colour in docs/04 §5', () => {
    expect(bands.NO_MATCH.colour).toBe(palette.clear);
    expect(bands.WEAK.colour).toBe(palette.warn);
    expect(bands.REVIEW.colour).toBe(palette.data);
    expect(bands.STRONG.colour).toBe(palette.alert);
  });

  it('keeps tone and colour in step', () => {
    for (const band of ALL) {
      expect(bands[band].colour).toBe(palette[bands[band].tone]);
    }
  });

  it('gives every band a distinct colour and a distinct label', () => {
    const colours = ALL.map((band) => bands[band].colour);
    const labels = ALL.map((band) => bands[band].label);
    expect(new Set(colours).size).toBe(ALL.length);
    expect(new Set(labels).size).toBe(ALL.length);
  });

  /**
   * Band legibility, measured rather than assumed.
   *
   * A band chip is the one thing on the results screen an officer reads at a
   * glance, so every band carries `primary` at AA — including STRONG, which
   * missed at 4.48 : 1 until `alert` was lifted to #ff2b2b.
   */
  const MEASURED: Record<Band, number> = {
    NO_MATCH: 4.7599,
    WEAK: 8.8455,
    REVIEW: 5.0574,
    STRONG: 4.8084,
  };

  it.each(ALL)('%s carries its label at AA on the band fill', (band) => {
    const ratio = contrastRatio(palette.primary, bands[band].colour);
    expect(ratio).toBeCloseTo(MEASURED[band], 3);
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });

  it('leaves no band relying on a foreground the components do not use', () => {
    // StatusChip and the candidate cards both render palette.primary. A band
    // that only worked with white text would be legible in the audit and
    // illegible on the screen.
    for (const band of ALL) {
      expect(contrastRatio(palette.primary, bands[band].colour)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('band language rules — docs/04 §5', () => {
  it('labels the top band STRONG CANDIDATE', () => {
    expect(bands.STRONG.label).toBe('STRONG CANDIDATE');
  });

  it('never asserts a match', () => {
    for (const band of ALL) {
      const { label } = bands[band];
      expect(label).not.toBe('MATCH');
      expect(label).not.toMatch(/MATCH FOUND|IDENTIFIED|POSITIVE MATCH/);
      // The only permitted occurrence of the word is the negation, which is
      // the release outcome and asserts nothing about a person.
      if (label.includes('MATCH')) {
        expect(label).toBe('NO MATCH');
      }
    }
  });

  it('carries a text label on every band, so colour is never the sole channel', () => {
    for (const band of ALL) {
      expect(bands[band].label.trim().length).toBeGreaterThan(0);
    }
  });
});

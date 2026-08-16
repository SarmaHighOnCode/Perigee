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
   * No single foreground carries all four fills in the light palette, so each
   * band names the one it needs. Recorded as data because a band chip is the
   * one thing on the results screen an officer reads at a glance.
   */
  const LEGIBLE_ON = {
    NO_MATCH: { fg: 'onPrimary', measured: 4.5535 },
    WEAK: { fg: 'primary', measured: 8.8455 },
    REVIEW: { fg: 'primary', measured: 5.0574 },
  } as const;

  it.each(Object.entries(LEGIBLE_ON))(
    '%s carries its label at AA on the band fill',
    (band, { fg, measured }) => {
      const ratio = contrastRatio(palette[fg], bands[band as Band].colour);
      expect(ratio).toBeCloseTo(measured, 3);
      expect(ratio).toBeGreaterThanOrEqual(AA);
    },
  );

  /**
   * STRONG is the exception, and it is the worst one to have: 4.48 : 1 with
   * dark text and 4.00 : 1 with white, so NEITHER foreground reaches AA on
   * `alert`. STRONG CANDIDATE is the most consequential label the product
   * shows.
   *
   * Asserted as failing so the gap is recorded rather than lost. Dark text is
   * only 0.02 short — darkening `alert` slightly closes it, at which point
   * this test fails loudly and should be promoted into LEGIBLE_ON above.
   */
  it('records that STRONG does not reach AA with either foreground', () => {
    const dark = contrastRatio(palette.primary, bands.STRONG.colour);
    const light = contrastRatio(palette.onPrimary, bands.STRONG.colour);

    expect(dark).toBeCloseTo(4.4837, 3);
    expect(light).toBeCloseTo(3.9985, 3);
    expect(Math.max(dark, light)).toBeLessThan(AA);
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

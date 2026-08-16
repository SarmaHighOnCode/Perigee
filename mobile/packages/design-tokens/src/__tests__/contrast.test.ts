import { describe, expect, it } from 'vitest';

import { AA, AAA, BANNED_PAIRS, contrastRatio, palette, type PaletteTone } from '../index';

interface AuditedPair {
  readonly fg: PaletteTone;
  readonly bg: PaletteTone;
  /** WCAG 2.1 computed from the palette hexes, to 4 dp. */
  readonly measured: number;
  readonly verdict: 'AA' | 'AAA';
}

/**
 * docs/07-DESIGN-SYSTEM.md §3, "Contrast — audited, not assumed".
 *
 * Every figure here is COMPUTED from the hexes in palette.ts, never copied
 * from a table. A hand-rounded contrast figure drifts from the colour it
 * claims to describe, and a drifted accessibility figure is worse than none:
 * it reads as a guarantee.
 *
 * The accents are FILLS carrying `primary` text — a band chip, a candidate
 * card, an error box. So the pairing that has to clear AA is dark-on-accent,
 * which is why `signal` and `alert` were lifted rather than deepened.
 */
const AUDITED: readonly AuditedPair[] = [
  { fg: 'primary', bg: 'canvas', measured: 17.9278, verdict: 'AAA' },
  { fg: 'primary', bg: 'canvasSoft', measured: 17.1761, verdict: 'AAA' },
  { fg: 'onPrimary', bg: 'primary', measured: 17.9278, verdict: 'AAA' },
  { fg: 'primary', bg: 'warn', measured: 8.8455, verdict: 'AAA' },
  { fg: 'primary', bg: 'data', measured: 5.0574, verdict: 'AA' },
  { fg: 'primary', bg: 'alert', measured: 4.8084, verdict: 'AA' },
  { fg: 'primary', bg: 'signal', measured: 4.7599, verdict: 'AA' },
  { fg: 'primary', bg: 'clear', measured: 4.7599, verdict: 'AA' },
];

/**
 * The rule the palette encodes: an accent is a FILL, never body text on the
 * canvas. Amber on white is 2.03 : 1 — unreadable in the direct sun this app
 * is used in — and no accent reaches AA that way round.
 *
 * Asserted as failing so the rule is enforced by the suite rather than left to
 * memory: reach for the chip form (dark text on the accent) instead.
 */
const NEVER_AS_TEXT: readonly { readonly tone: PaletteTone; readonly measured: number }[] = [
  { tone: 'signal', measured: 3.7664 },
  { tone: 'alert', measured: 3.7284 },
  { tone: 'warn', measured: 2.0268 },
  { tone: 'data', measured: 3.5449 },
  { tone: 'mute', measured: 3.5449 },
];

const BANNED: readonly { readonly fg: PaletteTone; readonly bg: PaletteTone; readonly measured: number }[] =
  [
    { fg: 'signal', bg: 'data', measured: 1.0625 },
    { fg: 'alert', bg: 'warn', measured: 1.8396 },
  ];

describe('contrastRatio', () => {
  it('returns 21 : 1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
  });

  it('returns 1 : 1 for a colour against itself', () => {
    expect(contrastRatio(palette.signal, palette.signal)).toBeCloseTo(1, 6);
  });

  it('is order-independent', () => {
    expect(contrastRatio(palette.primary, palette.canvas)).toBeCloseTo(
      contrastRatio(palette.canvas, palette.primary),
      6,
    );
  });

  it('accepts hex with or without the leading #', () => {
    expect(contrastRatio('171717', 'ffffff')).toBeCloseTo(contrastRatio('#171717', '#ffffff'), 6);
  });

  it.each(['', '#FFF', 'rebeccapurple', '#GGGGGG', '#0A0A0A0A'])(
    'rejects %j rather than returning a plausible number',
    (bad) => {
      expect(() => contrastRatio(bad, '#000000')).toThrow(/6-digit hex/);
    },
  );
});

describe('audited pairings', () => {
  it.each(AUDITED)('$fg on $bg clears $verdict', ({ fg, bg, verdict }) => {
    const floor = verdict === 'AAA' ? AAA : AA;
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(floor);
  });

  it.each(AUDITED)('$fg on $bg measures $measured : 1', ({ fg, bg, measured }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeCloseTo(measured, 3);
  });

  it('carries dark text at AA on EVERY accent fill', () => {
    // The whole point of the accent tuning. If a recolour breaks this, a band
    // chip or a candidate card has become hard to read.
    for (const accent of ['signal', 'alert', 'data', 'clear', 'warn'] as const) {
      expect(contrastRatio(palette.primary, palette[accent])).toBeGreaterThanOrEqual(AA);
    }
  });

  it('carries body text on both canvases at AAA', () => {
    expect(contrastRatio(palette.primary, palette.canvas)).toBeGreaterThanOrEqual(AAA);
    expect(contrastRatio(palette.primary, palette.canvasSoft)).toBeGreaterThanOrEqual(AAA);
  });
});

describe('accents are fills, not text', () => {
  it.each(NEVER_AS_TEXT)('$tone on canvas measures $measured : 1', ({ tone, measured }) => {
    expect(contrastRatio(palette[tone], palette.canvas)).toBeCloseTo(measured, 3);
  });

  it.each(NEVER_AS_TEXT)('$tone must not be used as text on the canvas', ({ tone }) => {
    expect(contrastRatio(palette[tone], palette.canvas)).toBeLessThan(AA);
  });

  it('offers the chip form as the compliant alternative', () => {
    for (const tone of NEVER_AS_TEXT) {
      if (tone.tone === 'mute') continue; // structural, never a fill
      expect(contrastRatio(palette.primary, palette[tone.tone])).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('BANNED_PAIRS', () => {
  it('lists exactly the two pairings banned by docs/07 §3', () => {
    expect(BANNED_PAIRS).toEqual([
      ['signal', 'data'],
      ['alert', 'warn'],
    ]);
  });

  it.each(BANNED)('$fg on $bg fails AA in both directions', ({ fg, bg }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeLessThan(AA);
    expect(contrastRatio(palette[bg], palette[fg])).toBeLessThan(AA);
  });

  it.each(BANNED)('$fg on $bg is near-invisible at $measured : 1', ({ fg, bg, measured }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeCloseTo(measured, 3);
  });

  it('detects every banned pair via the exported constant', () => {
    for (const [fg, bg] of BANNED_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg])).toBeLessThan(3);
    }
  });
});

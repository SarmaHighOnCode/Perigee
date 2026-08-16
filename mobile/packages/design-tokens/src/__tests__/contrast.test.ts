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
 */
const AUDITED: readonly AuditedPair[] = [
  { fg: 'primary', bg: 'canvas', measured: 17.9278, verdict: 'AAA' },
  { fg: 'primary', bg: 'canvasSoft', measured: 17.1761, verdict: 'AAA' },
  { fg: 'onPrimary', bg: 'primary', measured: 17.9278, verdict: 'AAA' },
  { fg: 'primary', bg: 'warn', measured: 8.8455, verdict: 'AAA' },
  { fg: 'onPrimary', bg: 'signal', measured: 4.5535, verdict: 'AA' },
  { fg: 'signal', bg: 'canvas', measured: 4.5535, verdict: 'AA' },
];

/**
 * Pairings the light palette does NOT carry at body-text size.
 *
 * These are asserted to fail, not skipped. The palette is what it is — this
 * records the consequence so it cannot be lost, and so any recolour that fixes
 * one of these breaks this test loudly instead of passing unnoticed.
 *
 * `warn` on `canvas` at 2.03 : 1 is the worst of them: amber on white is close
 * to unreadable in direct sun, which is the condition this app is used in.
 * Each of these needs either a darker hex or a filled chip (dark text on the
 * accent, as `primary` on `warn` above already does at 8.85 : 1).
 */
const BELOW_AA: readonly { readonly fg: PaletteTone; readonly bg: PaletteTone; readonly measured: number }[] =
  [
    { fg: 'alert', bg: 'canvas', measured: 3.9985 },
    { fg: 'data', bg: 'canvas', measured: 3.5449 },
    { fg: 'mute', bg: 'canvas', measured: 3.5449 },
    { fg: 'warn', bg: 'canvas', measured: 2.0268 },
    { fg: 'primary', bg: 'signal', measured: 3.9372 },
  ];

const BANNED: readonly { readonly fg: PaletteTone; readonly bg: PaletteTone; readonly measured: number }[] =
  [
    { fg: 'signal', bg: 'data', measured: 1.2845 },
    { fg: 'alert', bg: 'warn', measured: 1.9728 },
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
    expect(contrastRatio('171717', 'ffffff')).toBeCloseTo(
      contrastRatio('#171717', '#ffffff'),
      6,
    );
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

  it('carries body text on both canvases at AAA', () => {
    expect(contrastRatio(palette.primary, palette.canvas)).toBeGreaterThanOrEqual(AAA);
    expect(contrastRatio(palette.primary, palette.canvasSoft)).toBeGreaterThanOrEqual(AAA);
  });
});

describe('pairings below AA', () => {
  it.each(BELOW_AA)('$fg on $bg measures $measured : 1', ({ fg, bg, measured }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeCloseTo(measured, 3);
  });

  it.each(BELOW_AA)('$fg on $bg does NOT reach AA — do not use for body text', ({ fg, bg }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeLessThan(AA);
  });

  it('offers a compliant alternative for the warn accent', () => {
    // The escape hatch: dark text on the fill, rather than the fill as text.
    expect(contrastRatio(palette.primary, palette.warn)).toBeGreaterThanOrEqual(AAA);
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

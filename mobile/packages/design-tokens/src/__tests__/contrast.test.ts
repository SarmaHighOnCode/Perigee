import { describe, expect, it } from 'vitest';

import { AA, AAA, BANNED_PAIRS, contrastRatio, palette, type Tone } from '../index';

interface AuditedPair {
  readonly fg: Tone;
  readonly bg: Tone;
  /** The figure printed in the docs/07 §3 table. */
  readonly documented: number;
  /** WCAG 2.1 computed from the palette hexes, to 4 dp. */
  readonly measured: number;
  readonly verdict: 'AA' | 'AAA';
}

/**
 * docs/07-DESIGN-SYSTEM.md §3, "Contrast — audited, not assumed".
 *
 * `documented` is what the table prints; `measured` is what WCAG 2.1 actually
 * returns for those hexes. The table is hand-rounded and drifts — `data` on
 * `void` is printed as 10.1 : 1 but computes to 8.96 : 1. Every row still
 * clears the verdict it claims, which is the property that matters, so the
 * assertions below check the verdict strictly and the printed figure loosely.
 */
const AUDITED: readonly AuditedPair[] = [
  { fg: 'ink', bg: 'paper', documented: 19.8, measured: 19.503, verdict: 'AAA' },
  { fg: 'ink', bg: 'signal', documented: 15.9, measured: 15.6224, verdict: 'AAA' },
  { fg: 'ink', bg: 'data', documented: 8.9, measured: 9.0309, verdict: 'AAA' },
  { fg: 'ink', bg: 'clear', documented: 8.2, measured: 8.8494, verdict: 'AAA' },
  { fg: 'ink', bg: 'alert', documented: 6.4, measured: 6.1133, verdict: 'AA' },
  { fg: 'ink', bg: 'warn', documented: 6.1, measured: 6.9341, verdict: 'AA' },
  { fg: 'bone', bg: 'void', documented: 15.1, measured: 15.6621, verdict: 'AAA' },
  { fg: 'data', bg: 'void', documented: 10.1, measured: 8.9559, verdict: 'AAA' },
];

const BANNED: readonly { readonly fg: Tone; readonly bg: Tone; readonly documented: number }[] =
  [
    { fg: 'signal', bg: 'data', documented: 1.8 },
    { fg: 'alert', bg: 'warn', documented: 1.1 },
  ];

describe('contrastRatio', () => {
  it('returns 21 : 1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
  });

  it('returns 1 : 1 for a colour against itself', () => {
    expect(contrastRatio(palette.signal, palette.signal)).toBeCloseTo(1, 6);
  });

  it('is order-independent', () => {
    expect(contrastRatio(palette.ink, palette.paper)).toBeCloseTo(
      contrastRatio(palette.paper, palette.ink),
      6,
    );
  });

  it('accepts hex with or without the leading #', () => {
    expect(contrastRatio('0A0A0A', 'FFFEF0')).toBeCloseTo(
      contrastRatio('#0A0A0A', '#FFFEF0'),
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

describe('docs/07 §3 contrast table', () => {
  it.each(AUDITED)('$fg on $bg clears $verdict', ({ fg, bg, verdict }) => {
    const floor = verdict === 'AAA' ? AAA : AA;
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(floor);
  });

  it.each(AUDITED)('$fg on $bg measures $measured : 1', ({ fg, bg, measured }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeCloseTo(measured, 3);
  });

  it.each(AUDITED)(
    '$fg on $bg stays within rounding distance of the documented $documented',
    ({ documented, measured }) => {
      expect(Math.abs(measured - documented)).toBeLessThan(1.2);
    },
  );

  it('audits every accent against ink, since accents are only ever ink-on-fill', () => {
    const accents: readonly Tone[] = ['signal', 'alert', 'data', 'clear', 'warn'];
    for (const accent of accents) {
      expect(contrastRatio(palette.ink, palette[accent])).toBeGreaterThanOrEqual(AA);
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

  it.each(BANNED)('$fg on $bg is near-invisible at $documented : 1', ({ fg, bg, documented }) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeCloseTo(documented, 0);
  });

  it('detects every banned pair via the exported constant', () => {
    for (const [fg, bg] of BANNED_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg])).toBeLessThan(3);
    }
  });
});

/**
 * docs/07-DESIGN-SYSTEM.md §3.
 *
 * DAY and NIGHT are two operating conditions, not cosmetic themes. Colour
 * carries meaning here, so each token is assigned once and never reused
 * decoratively.
 */
export const palette = {
  primary: '#171717',
  onPrimary: '#ffffff',
  canvas: '#ffffff',
  canvasSoft: '#fafafa',
  hairline: '#ebebeb',
  mute: '#888888',

  // Accents are FILLS carrying dark text, never body text on the canvas — see
  // the audit in __tests__/contrast.test.ts. Each is therefore tuned so
  // `primary` on it clears WCAG AA (4.5 : 1), which pure #0070f3 (3.94) and
  // pure #ff0000 (4.48) both missed. Darkening them would have been the wrong
  // direction: it is the TEXT that sits on top.
  signal: '#1a80ff', // Vercel blue, lifted for legibility: 4.76 : 1
  alert: '#ff2b2b', // Vercel error, lifted for legibility: 4.81 : 1
  data: '#888888', // Maps to Vercel mute: 5.06 : 1
  clear: '#1a80ff',
  warn: '#f5a623', // 8.85 : 1
} as const;

export type PaletteTone = keyof typeof palette;

// The semantic subset: tones that carry meaning, as opposed to the structural
// keys (canvas, hairline, mute) used for surfaces. `satisfies` ties it to the
// palette, so removing a colour here fails to compile rather than failing at
// every `palette[tone]` call site — which is how 'secondary' survived its own
// deletion until now.
const TONES = ['primary', 'signal', 'alert', 'data', 'clear', 'warn'] as const satisfies
  readonly PaletteTone[];
export type Tone = (typeof TONES)[number];
export type SemanticTone = PaletteTone | 'neutral';

export type PaletteColour = (typeof palette)[PaletteTone];

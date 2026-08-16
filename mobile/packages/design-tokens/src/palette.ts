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

  signal: '#0070f3', // Maps to Vercel success/link
  alert: '#ff0000', // Maps to Vercel error
  data: '#888888', // Maps to Vercel mute
  clear: '#0070f3',
  warn: '#f5a623',
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

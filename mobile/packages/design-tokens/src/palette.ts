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
export type Tone = 'primary' | 'secondary' | 'signal' | 'alert' | 'data' | 'clear' | 'warn';
export type SemanticTone = PaletteTone | 'neutral';

export type PaletteColour = (typeof palette)[PaletteTone];

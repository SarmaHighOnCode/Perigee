/**
 * docs/07-DESIGN-SYSTEM.md §3.
 *
 * DAY and NIGHT are two operating conditions, not cosmetic themes. Colour
 * carries meaning here, so each token is assigned once and never reused
 * decoratively.
 */
export const palette = {
  ink: '#0A0A0A', // every border, every shadow, all DAY text
  paper: '#FFFEF0', // DAY surface — warm off-white
  void: '#0B0B10', // NIGHT surface — blue-black, preserves night vision
  slab: '#16161F', // NIGHT raised surface
  bone: '#E8E6D9', // NIGHT primary text

  signal: '#FFE600', // primary action, attention
  alert: '#FF3EA5', // STRONG candidate, destructive, ambiguity
  data: '#00C2CB', // REVIEW candidate, scores, IDs, telemetry
  clear: '#00C853', // NO MATCH, cleared, proceed
  warn: '#FF6B00', // WEAK candidate, degraded quality
} as const;

/** A palette key usable as a surface fill or an accent. */
export type Tone = keyof typeof palette;

export type PaletteColour = (typeof palette)[Tone];

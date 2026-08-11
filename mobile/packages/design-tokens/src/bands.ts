import { palette, type PaletteColour, type Tone } from './palette';

/**
 * The score bands, matching the backend contract exactly
 * (`backend/app/services/scoring.py`, docs/04-FACE-PIPELINE.md §5).
 */
export type Band = 'NO_MATCH' | 'WEAK' | 'REVIEW' | 'STRONG';

export interface BandToken {
  /** Palette key, for components that take a `tone`. */
  readonly tone: Tone;
  /** The resolved hex, for anything that needs a raw colour. */
  readonly colour: PaletteColour;
  /** The string the officer reads. Colour is never the sole channel. */
  readonly label: string;
}

/**
 * Labels are taken verbatim from docs/04-FACE-PIPELINE.md §5.
 *
 * The word MATCH is never a system assertion — the top band is
 * `STRONG CANDIDATE`, never `MATCH FOUND`. Automation bias is driven by the
 * language a system uses about its own confidence. The single permitted
 * occurrence of the word is the negation `NO MATCH`, which is the release
 * outcome (docs/07 §3 and §10) and asserts nothing about a person.
 */
export const bands = {
  NO_MATCH: { tone: 'clear', colour: palette.clear, label: 'NO MATCH' },
  WEAK: { tone: 'warn', colour: palette.warn, label: 'INSUFFICIENT' },
  REVIEW: {
    tone: 'data',
    colour: palette.data,
    label: 'REQUIRES VERIFICATION',
  },
  STRONG: { tone: 'alert', colour: palette.alert, label: 'STRONG CANDIDATE' },
} as const satisfies Record<Band, BandToken>;

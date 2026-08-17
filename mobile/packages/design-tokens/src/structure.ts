/**
 * docs/07-DESIGN-SYSTEM.md §4.
 *
 * Structure is carried by a hairline border and rounded corners, not by the
 * heavy 3 px border and hard offset shadow the brutalist palette used before
 * the light redesign. Depth comes from `elevation` below.
 */
export const structure = {
  borderWidth: 1,
} as const;

export const radii = { 
  none: 0, 
  xs: 4,
  sm: 6, 
  md: 8, 
  lg: 12, 
  xl: 16,
  pillSm: 64,
  pill: 9999 
} as const;

/**
 * Standard Vercel subtle shadows.
 */
export const elevation = {
  /** Flush surfaces, disabled. */
  0: { elevation: 0 },
  /** Inputs, chips, list rows. */
  1: { elevation: 1 },
  /** Cards, buttons — the default. */
  2: { elevation: 2 },
  /** Modals, the ambiguity warning. */
  3: { elevation: 4 },
  /** Floating / heavy. */
  4: { elevation: 6 },
} as const;

export type ElevationLevel = keyof typeof elevation;

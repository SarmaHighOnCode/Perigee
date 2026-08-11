/** docs/07-DESIGN-SYSTEM.md §5. 4 dp base unit. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const;

export type SpaceStep = keyof typeof space;

/**
 * Touch targets — docs/07 §5. Sized for a gloved thumb on a phone held
 * one-handed in direct sun, which puts every value above the 48 dp WCAG floor.
 */
export const touch = {
  primary: 64,
  secondary: 56,
  icon: 48,
  /** Candidate card tap zone: full width × 96 dp. */
  candidate: 96,
} as const;

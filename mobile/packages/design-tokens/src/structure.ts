/**
 * docs/07-DESIGN-SYSTEM.md §4.
 *
 * `border: 3 solid ink` and `shadow: 5 5 0 ink` are the entire design system.
 * Shadow direction is always bottom-right — one light source, top-left.
 */
export const structure = {
  borderWidth: 3,
  shadowOffset: 5,
  radius: {
    none: 0,
    /** Inputs only, so the caret does not collide with the corner. */
    input: 4,
    /** Status chips only. */
    pill: 999,
  },
} as const;

/**
 * Depth comes from shadow *offset*, never blur — docs/07 §4. Android's
 * `elevation` prop is a blurred shadow and is exactly what this system exists
 * to avoid, so these are offsets for a solid sibling, not native elevations.
 */
export const elevation = {
  /** Flush surfaces, disabled. */
  0: { offset: 0 },
  /** Inputs, chips, list rows. */
  1: { offset: 3 },
  /** Cards, buttons — the default. */
  2: { offset: 5 },
  /** Modals, the ambiguity warning. */
  3: { offset: 8 },
  /** The capture button. One per screen, maximum. */
  4: { offset: 12 },
} as const;

export type ElevationLevel = keyof typeof elevation;

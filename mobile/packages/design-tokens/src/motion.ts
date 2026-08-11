/**
 * docs/07-DESIGN-SYSTEM.md §6.
 *
 * Neobrutalist motion is mechanical, not organic. Things snap, stamp and slam.
 * If an animation feels smooth, it is wrong for this system.
 *
 * These are plain numbers on purpose: this package has zero runtime
 * dependencies, so the easing curves in docs/07 §6 (which are built from
 * Reanimated's `Easing`) are constructed by the consumer, not stored here.
 */
export const motion = {
  /** Buttons — a physical press with a hard stop. */
  press: { damping: 15, stiffness: 400, mass: 0.7 },
  /** Cards entering — overshoot, then snap. */
  enter: { damping: 12, stiffness: 220, mass: 0.9 },
  /** State changes — sharp, no ease-out tail. */
  snap: { duration: 140 },
  /** Candidate reveal, ms between cards. */
  stagger: 60,
} as const;

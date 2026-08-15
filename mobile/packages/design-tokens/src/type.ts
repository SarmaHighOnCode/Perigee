/**
 * docs/07-DESIGN-SYSTEM.md §2.
 *
 * Three faces, self-hosted. Display type is uppercase; `score` is always the
 * data face with tabular figures so scores compare by column.
 */
/**
 * docs/07 §2 calls this export `type`. It is named `fonts` here because
 * `import { type }` collides with TypeScript's type-only import modifier, and
 * every consumer would have to work around it.
 */
export const fonts = {
  display: 'Archivo',
  data: 'MartianMono',
  body: 'PublicSans',
} as const;

export type FontRole = keyof typeof fonts;

/**
 * `size`/`lh`/`tracking` are dp. `font` names the role in `fonts`, so a
 * consumer never has to infer which face a step belongs to.
 */
export const scale = {
  hero: {
    size: 48,
    lh: 48,
    weight: '600',
    tracking: -2.4,
    transform: 'none',
    font: 'display',
  },
  h1: {
    size: 32,
    lh: 40,
    weight: '600',
    tracking: -1.28,
    transform: 'none',
    font: 'display',
  },
  h2: {
    size: 24,
    lh: 32,
    weight: '600',
    tracking: -0.96,
    transform: 'none',
    font: 'display',
  },
  label: {
    size: 12,
    lh: 16,
    weight: '400',
    tracking: 0,
    transform: 'none',
    font: 'data',
  },
  body: { size: 16, lh: 24, weight: '400', tracking: 0, font: 'body' },
  bodySm: { size: 14, lh: 20, weight: '400', tracking: -0.28, font: 'body' },
  score: {
    size: 44,
    lh: 44,
    weight: '600',
    tracking: 0,
    font: 'data',
    variant: 'tabular-nums',
  },
  mono: { size: 13, lh: 18, weight: '400', tracking: 0, font: 'data' },
} as const;

export type ScaleStep = keyof typeof scale;

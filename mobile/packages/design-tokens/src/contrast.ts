import type { Tone } from './palette';

/** WCAG 2.1 minimum for normal-size body text. */
export const AA = 4.5;
/** WCAG 2.1 enhanced. */
export const AAA = 7;

const SIX_DIGIT_HEX = /^[0-9a-f]{6}$/i;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!SIX_DIGIT_HEX.test(digits)) {
    throw new Error(`expected a 6-digit hex colour, received "${hex}"`);
  }
  const n = Number.parseInt(digits, 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/**
 * WCAG 2.1 contrast ratio, 1..21. Order-independent.
 *
 * NN/g specifically flags neobrutalist palettes for contrast failures, so
 * docs/07 §3 audits every pairing rather than assuming.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const a = relativeLuminance(hex1);
  const b = relativeLuminance(hex2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * docs/07 §3: accent colours never touch each other as foreground/background.
 * These two pairings are the ones that would actually get reached for, and
 * both are illegible. Order is irrelevant — neither direction is permitted.
 */
export const BANNED_PAIRS = [
  ['signal', 'data'],
  ['alert', 'warn'],
] as const satisfies readonly (readonly [Tone, Tone])[];

import type { TimingSummary } from '../types';

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function summarizeTimings(samples: readonly number[]): TimingSummary | null {
  const sorted = samples
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .slice()
    .sort((left, right) => left - right);

  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);

  return {
    count: sorted.length,
    minMs: round(sorted[0] ?? 0),
    medianMs: round(median),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

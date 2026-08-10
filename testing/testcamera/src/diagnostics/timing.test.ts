import { describe, expect, it } from 'vitest';

import { summarizeTimings } from './timing';

describe('summarizeTimings', () => {
  it('summarizes count, minimum, median, and maximum without mutating samples', () => {
    const samples = [40, 10, 20, 30];

    expect(summarizeTimings(samples)).toEqual({
      count: 4,
      minMs: 10,
      medianMs: 25,
      maxMs: 40,
    });
    expect(samples).toEqual([40, 10, 20, 30]);
  });

  it('returns null when no valid samples exist', () => {
    expect(summarizeTimings([])).toBeNull();
    expect(summarizeTimings([Number.NaN, -1])).toBeNull();
  });
});

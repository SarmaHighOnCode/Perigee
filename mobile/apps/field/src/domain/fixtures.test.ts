import { describe, expect, it } from 'vitest';

import { fixtureDefinitions, parseProbeFixtureBundle } from './fixtures';

describe('synthetic probe fixtures', () => {
  it('labels all four connectivity outcomes without recognition language', () => {
    expect(Object.keys(fixtureDefinitions)).toEqual([
      'FIXTURE_STRONG', 'FIXTURE_REVIEW', 'FIXTURE_AMBIGUOUS', 'FIXTURE_NO_MATCH',
    ]);
    expect(JSON.stringify(fixtureDefinitions).toLowerCase()).not.toContain('recognized');
    expect(JSON.stringify(fixtureDefinitions).toLowerCase()).not.toContain('identity confirmed');
  });

  it('accepts only normalized 512-dimensional generated fixture bundles', () => {
    const embedding = Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0));
    expect(parseProbeFixtureBundle({
      model_id: 'fixture/model@1',
      dim: 512,
      note: 'CONNECTIVITY FIXTURES ONLY',
      fixtures: {
        FIXTURE_STRONG: { embedding, expected_band: 'STRONG' },
      },
    }).model_id).toBe('fixture/model@1');
    expect(() => parseProbeFixtureBundle({
      model_id: 'fixture/model@1', dim: 511, note: 'CONNECTIVITY FIXTURES ONLY', fixtures: {},
    })).toThrow('512');
  });
});

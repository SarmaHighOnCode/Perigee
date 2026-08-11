export const fixtureDefinitions = {
  FIXTURE_STRONG: {
    title: 'Strong candidate set',
    description: 'Exercises high-ranked candidate review. Human decision remains required.',
  },
  FIXTURE_REVIEW: {
    title: 'Review candidate set',
    description: 'Exercises the manual-review similarity band.',
  },
  FIXTURE_AMBIGUOUS: {
    title: 'Ambiguous candidate set',
    description: 'Exercises close scores and the deliberate second confirmation step.',
  },
  FIXTURE_NO_MATCH: {
    title: 'No-candidate result',
    description: 'Exercises the zero-candidate release outcome.',
  },
} as const;

export type FixtureName = keyof typeof fixtureDefinitions;

export interface ProbeFixture {
  embedding: number[];
  expected_band: string;
  observed_top_similarity?: number;
}

export interface ProbeFixtureBundle {
  model_id: string;
  dim: 512;
  note: string;
  fixtures: Partial<Record<FixtureName, ProbeFixture>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProbeFixtureBundle(value: unknown): ProbeFixtureBundle {
  if (!isRecord(value) || value.dim !== 512) {
    throw new Error('Probe fixture bundle must declare 512 dimensions');
  }
  if (typeof value.model_id !== 'string' || !value.model_id) {
    throw new Error('Probe fixture bundle model_id is required');
  }
  if (typeof value.note !== 'string' || !value.note.toUpperCase().includes('CONNECTIVITY')) {
    throw new Error('Probe fixture bundle must retain the connectivity-only notice');
  }
  if (!isRecord(value.fixtures)) throw new Error('Probe fixture bundle fixtures are required');

  const parsed: Partial<Record<FixtureName, ProbeFixture>> = {};
  for (const [name, fixture] of Object.entries(value.fixtures)) {
    if (!(name in fixtureDefinitions) || !isRecord(fixture)) {
      throw new Error(`Unknown probe fixture ${name}`);
    }
    const embedding = fixture.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length !== 512 ||
      !embedding.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ) {
      throw new Error(`${name} embedding must contain 512 finite numbers`);
    }
    const norm = Math.sqrt(embedding.reduce((sum, entry) => sum + entry * entry, 0));
    if (Math.abs(norm - 1) > 0.002) throw new Error(`${name} embedding must be L2-normalized`);
    if (typeof fixture.expected_band !== 'string') {
      throw new Error(`${name} expected_band is required`);
    }
    parsed[name as FixtureName] = {
      embedding,
      expected_band: fixture.expected_band,
      ...(typeof fixture.observed_top_similarity === 'number'
        ? { observed_top_similarity: fixture.observed_top_similarity }
        : {}),
    };
  }

  return {
    model_id: value.model_id,
    dim: 512,
    note: value.note,
    fixtures: parsed,
  };
}

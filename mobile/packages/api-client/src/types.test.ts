import { describe, expect, it } from 'vitest';

import { isSearchResponse } from './types';

const validResponse = {
  search_id: '018f2c52-38da-7d1a-a5fd-677004ea6c21',
  status: 'PENDING_DECISION',
  expires_at: '2026-08-11T12:30:00Z',
  candidates: [
    {
      rank: 1,
      person_id: '52ca2101-297d-4eca-b584-27ca7dba2cad',
      masked_name: 'A••• K•••',
      age_band: '26-35',
      district: 'Bengaluru North',
      similarity: 0.6412,
      band: 'STRONG',
      mugshot_url: null,
      record_summary: { case_count: 2, convictions: 0, latest: '2026-06-01' },
    },
  ],
  score_gap: 0.0525,
  ambiguous: false,
  threshold_in_effect: 0.42,
  bands: { no_match: 0.28, review: 0.42, strong: 0.58 },
  advisory: 'Ranked candidates require human verification.',
  dataset_mode: 'synthetic',
  model_id: 'insightface/w600k_r50@1',
  server_time: '2026-08-11T12:00:00Z',
};

describe('isSearchResponse', () => {
  it('accepts the ranked-candidate contract', () => {
    expect(isSearchResponse(validResponse)).toBe(true);
  });

  it('rejects a machine-authored match assertion', () => {
    expect(isSearchResponse({ ...validResponse, is_match: true })).toBe(false);
  });

  it('rejects candidates without a human-readable band', () => {
    const invalid = structuredClone(validResponse);
    delete (invalid.candidates[0] as Partial<(typeof invalid.candidates)[number]>).band;
    expect(isSearchResponse(invalid)).toBe(false);
  });
});

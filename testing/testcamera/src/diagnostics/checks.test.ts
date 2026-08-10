import { describe, expect, it } from 'vitest';

import { hasUnresolvedCameraFailure, summarizeChecks } from './checks';
import type { EvidenceCheck } from '../types';

const check = (status: EvidenceCheck['status'], id: string): EvidenceCheck => ({
  id,
  label: id,
  status,
  detail: `${id} detail`,
});

describe('summarizeChecks', () => {
  it('returns compact counts without discarding the detailed evidence', () => {
    const checks = [
      check('PASS', 'camera'),
      check('PASS', 'gallery'),
      check('FAIL', 'runtime'),
      check('UNSUPPORTED', 'hdr'),
      check('NOT_TESTED', 'stock-camera'),
    ];

    expect(summarizeChecks(checks)).toEqual({
      pass: 2,
      fail: 1,
      unsupported: 1,
      notTested: 1,
      total: 5,
    });
  });

  it('returns zeroes for an empty report', () => {
    expect(summarizeChecks([])).toEqual({
      pass: 0,
      fail: 0,
      unsupported: 0,
      notTested: 0,
      total: 0,
    });
  });
});

describe('hasUnresolvedCameraFailure', () => {
  it('only exposes the current camera runtime failure', () => {
    expect(
      hasUnresolvedCameraFailure([
        check('FAIL', 'camera-runtime'),
      ]),
    ).toBe(true);
    expect(
      hasUnresolvedCameraFailure([
        check('PASS', 'camera-runtime'),
      ]),
    ).toBe(false);
  });
});

import type { EvidenceCheck } from '../types';

export interface CheckSummary {
  pass: number;
  fail: number;
  unsupported: number;
  notTested: number;
  total: number;
}

export function summarizeChecks(checks: EvidenceCheck[]): CheckSummary {
  const summary: CheckSummary = {
    pass: 0,
    fail: 0,
    unsupported: 0,
    notTested: 0,
    total: checks.length,
  };

  for (const check of checks) {
    if (check.status === 'PASS') summary.pass += 1;
    if (check.status === 'FAIL') summary.fail += 1;
    if (check.status === 'UNSUPPORTED') summary.unsupported += 1;
    if (check.status === 'NOT_TESTED') summary.notTested += 1;
  }

  return summary;
}

export function hasUnresolvedCameraFailure(
  checks: EvidenceCheck[],
): boolean {
  return checks.some(
    (check) => check.id === 'camera-runtime' && check.status === 'FAIL',
  );
}

import { describe, expect, it } from 'vitest';
import { fixtureVector } from '@perigee/face';

import { checkFaceConsistency } from './faceConsistency';

describe('checkFaceConsistency', () => {
  it('passes on consistent face captures', () => {
    const seed = 20260810;
    const captures = [
      { slot: 'frontal-1', embedding: fixtureVector(seed), quality: { score: 0.9, detScore: 0.95, blur: 120, yaw: 0, pitch: 0, facePx: 200 } },
      { slot: 'frontal-2', embedding: fixtureVector(seed), quality: { score: 0.88, detScore: 0.94, blur: 115, yaw: 1, pitch: -1, facePx: 195 } },
      { slot: 'left-1', embedding: fixtureVector(seed), quality: { score: 0.85, detScore: 0.92, blur: 110, yaw: -10, pitch: 0, facePx: 190 } },
    ];

    const result = checkFaceConsistency(captures);
    expect(result.isConsistent).toBe(true);
    expect(result.rejectedSlots).toHaveLength(0);
    expect(result.includedSlots).toHaveLength(3);
  });

  it('rejects an inconsistent foreign identity capture', () => {
    const seed = 20260810;
    const foreignSeed = 99999999;
    const captures = [
      { slot: 'frontal-1', embedding: fixtureVector(seed), quality: { score: 0.9, detScore: 0.95, blur: 120, yaw: 0, pitch: 0, facePx: 200 } },
      { slot: 'frontal-2', embedding: fixtureVector(seed), quality: { score: 0.88, detScore: 0.94, blur: 115, yaw: 1, pitch: -1, facePx: 195 } },
      { slot: 'left-1', embedding: fixtureVector(foreignSeed), quality: { score: 0.85, detScore: 0.92, blur: 110, yaw: -10, pitch: 0, facePx: 190 } },
    ];

    const result = checkFaceConsistency(captures);
    expect(result.isConsistent).toBe(false);
    expect(result.rejectedSlots).toContain('left-1');
  });
});

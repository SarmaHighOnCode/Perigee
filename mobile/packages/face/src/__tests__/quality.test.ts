import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUALITY_FLOOR,
  QUALITY_THRESHOLDS,
  assessQuality,
  coachingFor,
  evaluateQuality,
  qualityScore,
} from '../quality';
import type { QualitySignals } from '../types';

/** Clears every "good" value, so every normalised term is 1. */
const GOOD: QualitySignals = {
  detScore: 0.96,
  facePx: 224,
  blur: 142.3,
  yaw: -4.2,
  pitch: 2.1,
  brightness: 128,
  faceCount: 1,
};

/** Sits exactly on every hard floor, so every normalised term is 0. */
const AT_FLOOR: QualitySignals = {
  detScore: QUALITY_THRESHOLDS.det.floor,
  facePx: QUALITY_THRESHOLDS.facePx.floor,
  blur: QUALITY_THRESHOLDS.blur.floor,
  yaw: QUALITY_THRESHOLDS.yaw.floor,
  pitch: QUALITY_THRESHOLDS.pitch.floor,
  brightness: QUALITY_THRESHOLDS.brightness.floorLow,
  faceCount: 1,
};

function signals(overrides: Partial<QualitySignals>): QualitySignals {
  return { ...GOOD, ...overrides };
}

describe('qualityScore', () => {
  it('is 1 for a capture that clears every good value', () => {
    expect(qualityScore(GOOD)).toBeCloseTo(1, 10);
  });

  it('is 0 for a capture sitting exactly on every hard floor', () => {
    expect(qualityScore(AT_FLOOR)).toBeCloseTo(0, 10);
  });

  it('weights the detector at 0.30', () => {
    // Detector at its floor removes exactly its weight; nothing else moves.
    expect(qualityScore(signals({ detScore: 0.6 }))).toBeCloseTo(0.7, 10);
    // Halfway between floor and good contributes half its weight.
    expect(qualityScore(signals({ detScore: 0.725 }))).toBeCloseTo(0.85, 10);
  });

  it('weights face size at 0.25, blur at 0.20 and brightness at 0.10', () => {
    expect(qualityScore(signals({ facePx: 112 }))).toBeCloseTo(0.75, 10);
    expect(qualityScore(signals({ blur: 60 }))).toBeCloseTo(0.8, 10);
    expect(qualityScore(signals({ brightness: 40 }))).toBeCloseTo(0.9, 10);
    expect(qualityScore(signals({ brightness: 215 }))).toBeCloseTo(0.9, 10);
  });

  it('takes the worse of yaw and pitch for the 0.15 pose term', () => {
    // A level chin must not rescue a face turned to its yaw floor.
    expect(qualityScore(signals({ yaw: 35, pitch: 0 }))).toBeCloseTo(0.85, 10);
    expect(qualityScore(signals({ yaw: 0, pitch: 25 }))).toBeCloseTo(0.85, 10);
    // Halfway on the worse axis.
    expect(qualityScore(signals({ yaw: 25, pitch: 0 }))).toBeCloseTo(1 - 0.15 * 0.5, 10);
  });

  it('clamps rather than rewarding a metric past its good value', () => {
    expect(qualityScore(signals({ blur: 100_000, facePx: 4000, detScore: 1 }))).toBeCloseTo(1, 10);
  });
});

describe('assessQuality', () => {
  it('reports the six fields the API asks for, and no others', () => {
    expect(Object.keys(assessQuality(GOOD)).sort()).toEqual([
      'blur',
      'detScore',
      'facePx',
      'pitch',
      'score',
      'yaw',
    ]);
  });

  it('passes the raw measurements through untouched', () => {
    const report = assessQuality(GOOD);
    expect(report.detScore).toBe(GOOD.detScore);
    expect(report.blur).toBe(GOOD.blur);
    expect(report.yaw).toBe(GOOD.yaw);
    expect(report.pitch).toBe(GOOD.pitch);
    expect(report.facePx).toBe(GOOD.facePx);
  });
});

describe('coaching messages at each hard floor boundary', () => {
  it('says nothing when every floor is met', () => {
    expect(coachingFor(GOOD)).toBeNull();
    expect(coachingFor(AT_FLOOR)).toBeNull();
  });

  it('NO FACE DETECTED below detector confidence 0.60', () => {
    expect(coachingFor(signals({ detScore: 0.6 }))).toBeNull();
    expect(coachingFor(signals({ detScore: 0.599 }))).toBe('NO FACE DETECTED');
    expect(coachingFor(signals({ faceCount: 0 }))).toBe('NO FACE DETECTED');
  });

  it('MULTIPLE FACES — ISOLATE SUBJECT above one face', () => {
    expect(coachingFor(signals({ faceCount: 1 }))).toBeNull();
    expect(coachingFor(signals({ faceCount: 2 }))).toBe('MULTIPLE FACES — ISOLATE SUBJECT');
  });

  it('MOVE CLOSER below 112 px', () => {
    expect(coachingFor(signals({ facePx: 112 }))).toBeNull();
    expect(coachingFor(signals({ facePx: 111 }))).toBe('MOVE CLOSER');
  });

  it('HOLD STEADY below a Laplacian variance of 60', () => {
    expect(coachingFor(signals({ blur: 60 }))).toBeNull();
    expect(coachingFor(signals({ blur: 59.9 }))).toBe('HOLD STEADY');
  });

  it('FACE THE CAMERA beyond ±35° of yaw', () => {
    expect(coachingFor(signals({ yaw: 35 }))).toBeNull();
    expect(coachingFor(signals({ yaw: -35 }))).toBeNull();
    expect(coachingFor(signals({ yaw: 35.1 }))).toBe('FACE THE CAMERA');
    expect(coachingFor(signals({ yaw: -35.1 }))).toBe('FACE THE CAMERA');
  });

  it('LEVEL THE CAMERA beyond ±25° of pitch', () => {
    expect(coachingFor(signals({ pitch: 25 }))).toBeNull();
    expect(coachingFor(signals({ pitch: -25.1 }))).toBe('LEVEL THE CAMERA');
  });

  it('TOO DARK below luma 40 and MOVE TO SHADE above 215', () => {
    expect(coachingFor(signals({ brightness: 40 }))).toBeNull();
    expect(coachingFor(signals({ brightness: 39 }))).toBe('TOO DARK');
    expect(coachingFor(signals({ brightness: 215 }))).toBeNull();
    expect(coachingFor(signals({ brightness: 216 }))).toBe('MOVE TO SHADE');
  });

  it('coaches what the officer can act on first when several floors fail', () => {
    // No face at all outranks everything: there is nothing to aim or steady.
    expect(coachingFor({ ...AT_FLOOR, faceCount: 0, facePx: 10, blur: 1 })).toBe(
      'NO FACE DETECTED',
    );
    // Two faces outranks framing: the wrong subject is the bigger problem.
    expect(coachingFor(signals({ faceCount: 3, facePx: 10 }))).toBe(
      'MULTIPLE FACES — ISOLATE SUBJECT',
    );
    // Framing before pose, pose before blur.
    expect(coachingFor(signals({ facePx: 80, yaw: 60, blur: 5 }))).toBe('MOVE CLOSER');
    expect(coachingFor(signals({ yaw: 60, blur: 5 }))).toBe('FACE THE CAMERA');
  });
});

describe('evaluateQuality', () => {
  it('passes a good capture with nothing to say', () => {
    expect(evaluateQuality(GOOD)).toMatchObject({
      passes: true,
      coaching: null,
      hardFloorFailed: false,
    });
  });

  it('refuses a capture that misses a hard floor, whatever the composite says', () => {
    const result = evaluateQuality(signals({ faceCount: 2 }));

    expect(result.passes).toBe(false);
    expect(result.hardFloorFailed).toBe(true);
    expect(result.coaching).toBe('MULTIPLE FACES — ISOLATE SUBJECT');
    // The composite is still perfect — the floor is what refused it.
    expect(result.report.score).toBeCloseTo(1, 10);
  });

  it('refuses a capture below the quality floor even with every floor met', () => {
    const weak = signals({ detScore: 0.6, facePx: 112, blur: 60 });

    expect(qualityScore(weak)).toBeCloseTo(0.25, 10);
    expect(coachingFor(weak)).toBeNull();

    const result = evaluateQuality(weak);
    expect(result.passes).toBe(false);
    expect(result.hardFloorFailed).toBe(false);
    // Never "NO FACE DETECTED" here: a face at 0.60 confidence was detected.
    expect(result.coaching).toBe('MOVE CLOSER');
  });

  it('uses the floor it is given, not the compiled-in default', () => {
    const weak = signals({ detScore: 0.6, facePx: 112, blur: 60 });

    expect(evaluateQuality(weak, { qualityFloor: 0.2 }).passes).toBe(true);
    expect(evaluateQuality(weak, { qualityFloor: 0.5 }).passes).toBe(false);
    expect(DEFAULT_QUALITY_FLOOR).toBe(0.35);
  });
});

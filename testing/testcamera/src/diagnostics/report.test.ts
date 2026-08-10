import { describe, expect, it } from 'vitest';

import { buildReport, serializeReport } from './report';

describe('buildReport', () => {
  it('builds a stable serializable report with evidence classifications', () => {
    const report = buildReport({
      generatedAt: '2026-08-10T12:00:00.000Z',
      device: {
        manufacturer: 'Google',
        model: 'Pixel Test',
        osVersion: '16',
        apiLevel: 36,
        physicalDevice: true,
      },
      permissions: { camera: 'granted', mediaLibrary: 'limited' },
      cameras: [],
      selectedCamera: null,
      settings: null,
      media: null,
      captureSamplesMs: [120, 100, 110],
      checks: [
        { id: 'local-build', label: 'Local Android build', status: 'PASS', detail: 'Gradle debug APK' },
        { id: 'hdr', label: 'Photo HDR', status: 'UNSUPPORTED', detail: 'Not exposed by device' },
      ],
      errors: [],
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.captureTiming).toEqual({ count: 3, minMs: 100, medianMs: 110, maxMs: 120 });
    expect(report.manualComparison).toHaveLength(8);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('serializes report JSON with stable indentation', () => {
    const json = serializeReport(
      buildReport({
        generatedAt: '2026-08-10T12:00:00.000Z',
        device: { manufacturer: 'Unknown', model: 'Unknown', osVersion: 'Unknown', apiLevel: null, physicalDevice: false },
        permissions: { camera: 'not-determined', mediaLibrary: 'not-determined' },
        cameras: [],
        selectedCamera: null,
        settings: null,
        media: null,
        captureSamplesMs: [],
        checks: [],
        errors: [],
      }),
    );

    expect(json.endsWith('\n')).toBe(true);
    expect(json).toContain('  "schemaVersion": 1');
  });
});

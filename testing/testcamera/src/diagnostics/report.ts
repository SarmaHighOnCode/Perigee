import type { EvidenceInput, EvidenceReport } from '../types';
import { summarizeTimings } from './timing';

const MANUAL_COMPARISON = [
  'Exposure accuracy',
  'Highlight retention',
  'Shadow detail',
  'Facial detail',
  'Low-light noise',
  'Colour and skin tone',
  'Pixel dimensions and file size',
  'Capture latency',
] as const;

export function buildReport(input: EvidenceInput): EvidenceReport {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    device: input.device,
    permissions: input.permissions,
    cameras: input.cameras,
    selectedCamera: input.selectedCamera,
    settings: input.settings,
    media: input.media,
    captureTiming: summarizeTimings(input.captureSamplesMs),
    checks: input.checks,
    errors: input.errors,
    manualComparison: [...MANUAL_COMPARISON],
  };
}

export function serializeReport(report: EvidenceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

import { ensureModel, type ModelProgress } from './model-cache';
import { DETECTOR, RECOGNISER } from './models';

/**
 * Download (or verify) both ONNX weights up front so the first embed() call
 * does not silently stall on a ~190 MB transfer. Safe to call repeatedly:
 * ensureModel de-duplicates concurrent calls and validates cached files.
 */
export async function prepareFaceModels(
  baseUrl: string,
  onProgress?: (progress: ModelProgress) => void,
): Promise<void> {
  // Lazy import: native-model-files pulls in react-native-blob-util, which
  // must stay out of the bundler graph for tests (same reason engine.ts does this).
  const { nativeModelFiles } = await import('./native-model-files');
  await ensureModel(DETECTOR, baseUrl, nativeModelFiles, onProgress);
  await ensureModel(RECOGNISER, baseUrl, nativeModelFiles, onProgress);
}

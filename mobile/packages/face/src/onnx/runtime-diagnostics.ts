import { ensureModel, type ModelFileAdapter, type ModelProgress } from './model-cache';
import { DETECTOR, MODEL_ID, RECOGNISER, type ModelSpec } from './models';

export interface RuntimeDiagnostic {
  onnxRuntimeLoaded: boolean;
  skiaLoaded: boolean;
  detectorReady: boolean;
  recogniserReady: boolean;
  modelId: string;
  detectorInputs: string[];
  detectorOutputs: string[];
  recogniserInputs: string[];
  recogniserOutputs: string[];
  failures: string[];
}

export interface RuntimeSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  release(): Promise<void>;
}

interface OnnxRuntimeModule {
  InferenceSession: {
    create(
      path: string,
      options: { executionProviders: readonly ['cpu'] },
    ): Promise<RuntimeSession>;
  };
}

interface SkiaModule {
  Skia?: unknown;
}

export interface RuntimeDiagnosticDependencies {
  loadOnnxRuntime(): Promise<OnnxRuntimeModule>;
  loadSkia(): Promise<SkiaModule>;
  ensureModel: typeof ensureModel;
  files: ModelFileAdapter;
}

interface ModelDiagnosticTarget {
  label: 'Detector' | 'Recogniser';
  spec: ModelSpec;
  setInputs(names: string[]): void;
  setOutputs(names: string[]): void;
  setReady(ready: boolean): void;
}

interface PreparedModelDiagnosticTarget {
  target: ModelDiagnosticTarget;
  path: string;
}

interface OpenedModelDiagnosticSession {
  target: ModelDiagnosticTarget;
  session: RuntimeSession;
  metadataMatches: boolean;
}

function emptyDiagnostic(): RuntimeDiagnostic {
  return {
    onnxRuntimeLoaded: false,
    skiaLoaded: false,
    detectorReady: false,
    recogniserReady: false,
    modelId: MODEL_ID,
    detectorInputs: [],
    detectorOutputs: [],
    recogniserInputs: [],
    recogniserOutputs: [],
    failures: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formattedNames(names: readonly string[]): string {
  return `[${names.join(', ')}]`;
}

function namesMatch(discovered: readonly string[], expected: readonly string[]): boolean {
  return discovered.length === expected.length
    && discovered.every((name, index) => name === expected[index]);
}

async function prepareModel(
  baseUrl: string,
  target: ModelDiagnosticTarget,
  dependencies: RuntimeDiagnosticDependencies,
  failures: string[],
  onProgress?: (progress: ModelProgress) => void,
): Promise<string | undefined> {
  try {
    return await dependencies.ensureModel(
      target.spec,
      baseUrl,
      dependencies.files,
      onProgress,
    );
  } catch (error) {
    failures.push(`${target.label} model preparation failed: ${errorMessage(error)}`);
    return undefined;
  }
}

function inspectSession(
  target: ModelDiagnosticTarget,
  session: RuntimeSession,
  failures: string[],
): boolean {
  const inputs = [...session.inputNames];
  const outputs = [...session.outputNames];
  target.setInputs(inputs);
  target.setOutputs(outputs);

  const expectedInputs = [target.spec.inputName];
  const inputMatches = namesMatch(inputs, expectedInputs);
  const outputMatches = namesMatch(outputs, target.spec.outputNames);
  if (!inputMatches) {
    failures.push(
      `${target.label} input names mismatch: expected ${formattedNames(expectedInputs)}, received ${formattedNames(inputs)}.`,
    );
  }
  if (!outputMatches) {
    failures.push(
      `${target.label} output names mismatch: expected ${formattedNames(target.spec.outputNames)}, received ${formattedNames(outputs)}.`,
    );
  }

  return inputMatches && outputMatches;
}

export async function diagnoseRuntimeWithDependencies(
  baseUrl: string,
  dependencies: RuntimeDiagnosticDependencies,
  onProgress?: (progress: ModelProgress) => void,
): Promise<RuntimeDiagnostic> {
  const diagnostic = emptyDiagnostic();
  let runtime: OnnxRuntimeModule | undefined;

  try {
    runtime = await dependencies.loadOnnxRuntime();
    diagnostic.onnxRuntimeLoaded = true;
  } catch (error) {
    diagnostic.failures.push(`ONNX Runtime load failed: ${errorMessage(error)}`);
  }

  try {
    const skia = await dependencies.loadSkia();
    if (!skia.Skia) {
      throw new Error('module did not expose Skia');
    }
    diagnostic.skiaLoaded = true;
  } catch (error) {
    diagnostic.failures.push(`Skia load failed: ${errorMessage(error)}`);
  }

  if (!runtime) {
    return diagnostic;
  }

  const targets: readonly ModelDiagnosticTarget[] = [
    {
      label: 'Detector',
      spec: DETECTOR,
      setInputs: (names) => { diagnostic.detectorInputs = names; },
      setOutputs: (names) => { diagnostic.detectorOutputs = names; },
      setReady: (ready) => { diagnostic.detectorReady = ready; },
    },
    {
      label: 'Recogniser',
      spec: RECOGNISER,
      setInputs: (names) => { diagnostic.recogniserInputs = names; },
      setOutputs: (names) => { diagnostic.recogniserOutputs = names; },
      setReady: (ready) => { diagnostic.recogniserReady = ready; },
    },
  ];

  const prepared: PreparedModelDiagnosticTarget[] = [];
  for (const target of targets) {
    const path = await prepareModel(
      baseUrl,
      target,
      dependencies,
      diagnostic.failures,
      onProgress,
    );
    if (path !== undefined) {
      prepared.push({ target, path });
    }
  }

  const opened: OpenedModelDiagnosticSession[] = [];
  try {
    for (const { target, path } of prepared) {
      try {
        const session = await runtime.InferenceSession.create(path, {
          executionProviders: ['cpu'],
        });
        const openedSession: OpenedModelDiagnosticSession = {
          target,
          session,
          metadataMatches: false,
        };
        opened.push(openedSession);
        openedSession.metadataMatches = inspectSession(
          target,
          session,
          diagnostic.failures,
        );
      } catch (error) {
        diagnostic.failures.push(`${target.label} session failed: ${errorMessage(error)}`);
      }
    }
  } finally {
    for (const openedSession of [...opened].reverse()) {
      try {
        await openedSession.session.release();
        openedSession.target.setReady(openedSession.metadataMatches);
      } catch (error) {
        openedSession.target.setReady(false);
        diagnostic.failures.push(
          `${openedSession.target.label} session release failed: ${errorMessage(error)}`,
        );
      }
    }
  }

  return diagnostic;
}

export async function diagnoseRuntime(
  baseUrl: string,
  onProgress?: (progress: ModelProgress) => void,
): Promise<RuntimeDiagnostic> {
  const { nativeModelFiles } = await import('./native-model-files');
  return diagnoseRuntimeWithDependencies(
    baseUrl,
    {
      loadOnnxRuntime: () => import('onnxruntime-react-native'),
      loadSkia: () => import('@shopify/react-native-skia'),
      ensureModel,
      files: nativeModelFiles,
    },
    onProgress,
  );
}

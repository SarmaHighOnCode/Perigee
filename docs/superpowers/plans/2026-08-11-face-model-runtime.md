# Face Model Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the official InsightFace detector and recogniser safely, install the native runtime in both Android apps, and prove both packages can open the verified models.

**Architecture:** A developer-side Python tool downloads the official `buffalo_l` archive, verifies the archive and extracts only the two required ONNX files into a gitignored cache served over local HTTP. Each app streams those files into private storage, checks exact byte counts and raw SHA-256 using native file APIs, then opens one persistent ONNX Runtime session per model.

**Tech Stack:** Python 3.12, `onnxruntime==1.24.3`, Expo SDK 54, React Native 0.81, `onnxruntime-react-native@1.24.3`, React Native Skia 2.2.12, `react-native-blob-util@0.24.10`, Vitest.

---

## Verified model facts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `buffalo_l.zip` | 288,621,354 | `80ffe37d8a5940d59a7384c201a2a38d4741f2f3c51eef46ebb28218a7b0ca2f` |
| `det_10g.onnx` | 16,923,827 | `5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91` |
| `w600k_r50.onnx` | 174,383,860 | `4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43` |

Official archive URL:

```text
https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
```

Detector metadata:

```text
input: input.1 -> [1, 3, ?, ?]
score outputs:    448 [12800,1], 471 [3200,1], 494 [800,1]
box outputs:      451 [12800,4], 474 [3200,4], 497 [800,4]
landmark outputs: 454 [12800,10], 477 [3200,10], 500 [800,10]
```

Recognizer metadata:

```text
input:  input.1 -> [batch, 3, 112, 112]
output: 683     -> [1, 512]
model ID: insightface/w600k_r50@1
```

## Task 1: Deterministic model preparation tool

**Files:**
- Create: `testing/face-models/test_prepare_models.py`
- Create: `testing/face-models/prepare_models.py`
- Create: `testing/face-models/requirements.txt`
- Create: `testing/face-models/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing archive-manifest tests**

Pin the developer-only model inspection environment to `onnxruntime==1.24.3` and `pytest==8.3.4` in `requirements.txt`. This environment is separate from the backend because the API service never imports an image or inference runtime.

Create tests that import `prepare_models.py` and assert the immutable constants and entry-selection policy:

```python
def test_manifest_pins_the_official_archive():
    assert ARCHIVE.url.endswith("/v0.7/buffalo_l.zip")
    assert ARCHIVE.bytes == 288_621_354
    assert ARCHIVE.sha256 == "80ffe37d8a5940d59a7384c201a2a38d4741f2f3c51eef46ebb28218a7b0ca2f"


def test_only_required_models_are_exported():
    assert set(MODELS) == {"det_10g.onnx", "w600k_r50.onnx"}
    assert MODELS["det_10g.onnx"].sha256 == "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91"
    assert MODELS["w600k_r50.onnx"].sha256 == "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43"
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
python -m venv testing/face-models/.venv
testing\face-models\.venv\Scripts\python.exe -m pip install -r testing/face-models/requirements.txt
testing\face-models\.venv\Scripts\python.exe -m pytest testing/face-models/test_prepare_models.py -q
```

Expected: collection fails because `prepare_models.py` does not exist.

- [ ] **Step 3: Implement atomic download, validation, extraction, and serving**

Implement these exact public functions. The annotations below are the API contract; each body must implement the rules immediately following the signatures.

```python
def sha256_file(path: Path) -> str
def download_archive(cache: Path) -> Path
def validate_archive(path: Path) -> None
def extract_models(archive: Path, output: Path) -> dict[str, Path]
def write_manifest(models: dict[str, Path], output: Path) -> Path
def serve(output: Path, host: str, port: int) -> None
```

The implementation must:

- stream the HTTP response to `buffalo_l.zip.partial`;
- reject non-200 responses and a final length other than `288_621_354`;
- hash the completed partial file and compare the pinned archive digest;
- run `ZipFile.testzip()` before extracting;
- extract only the two named entries to `.partial` files;
- compare each extracted size and raw digest with the table above;
- use `Path.replace()` only after verification;
- write `manifest.json` with `name`, `bytes`, `sha256`, and local HTTP URL;
- serve `cache/models/` with `ThreadingHTTPServer` and `Access-Control-Allow-Origin: *`;
- exit non-zero on any mismatch and never retain a failed partial as a valid model.

CLI contract:

```powershell
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py prepare
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py serve --host 0.0.0.0 --port 8765
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py inspect
```

- [ ] **Step 4: Ignore all model binaries and cache files**

Add these exact patterns to the root `.gitignore`:

```gitignore
testing/face-models/cache/
*.onnx
buffalo_l*.zip
```

- [ ] **Step 5: Run unit and real-archive checks**

Run:

```powershell
testing\face-models\.venv\Scripts\python.exe -m pytest testing/face-models/test_prepare_models.py -q
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py prepare
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py inspect
```

Expected: tests pass; `inspect` prints both exact digests, sizes, and ONNX metadata listed above.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore testing/face-models
git commit -m "build: add verified InsightFace model preparation"
```

## Task 2: Install native dependencies in both applications

**Files:**
- Modify: `mobile/packages/face/package.json`
- Modify: `mobile/apps/field/package.json`
- Modify: `mobile/apps/enroll/package.json`
- Modify: `mobile/pnpm-lock.yaml`

- [ ] **Step 1: Add shared package runtime dependencies**

Run from `mobile/`:

```powershell
pnpm --filter @perigee/face add onnxruntime-react-native@1.24.3 @shopify/react-native-skia@2.2.12 react-native-blob-util@0.24.10
```

- [ ] **Step 2: Add direct app dependencies for native autolinking**

```powershell
pnpm --filter @perigee/field add onnxruntime-react-native@1.24.3 @shopify/react-native-skia@2.2.12 react-native-blob-util@0.24.10
pnpm --filter @perigee/enroll add @perigee/face@workspace:* onnxruntime-react-native@1.24.3 @shopify/react-native-skia@2.2.12 react-native-blob-util@0.24.10
pnpm install --frozen-lockfile
```

- [ ] **Step 3: Prove package resolution**

```powershell
pnpm --filter @perigee/face exec tsc --noEmit
pnpm --filter @perigee/field exec expo-doctor
pnpm --filter @perigee/enroll exec expo-doctor
```

Expected: both native packages resolve; both Expo Doctor runs pass all enabled checks.

- [ ] **Step 4: Commit**

```powershell
git add mobile/packages/face/package.json mobile/apps/field/package.json mobile/apps/enroll/package.json mobile/pnpm-lock.yaml
git commit -m "build: install on-device face inference dependencies"
```

## Task 3: Typed model registry

**Files:**
- Create: `mobile/packages/face/src/onnx/models.ts`
- Create: `mobile/packages/face/src/__tests__/models.test.ts`

- [ ] **Step 1: Write the failing registry test**

The test must assert the exact names, byte counts, hashes, input/output names, and model ID from the verified-facts section.

```ts
expect(DETECTOR.inputName).toBe('input.1');
expect(DETECTOR.outputNames).toEqual(['448', '471', '494', '451', '474', '497', '454', '477', '500']);
expect(RECOGNISER.outputNames).toEqual(['683']);
expect(RECOGNISER.sha256).toBe('4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43');
expect(MODEL_ID).toBe('insightface/w600k_r50@1');
```

- [ ] **Step 2: Confirm failure**

```powershell
pnpm --filter @perigee/face test -- models.test.ts
```

Expected: module import fails.

- [ ] **Step 3: Implement immutable specs**

Export:

```ts
export interface ModelSpec {
  key: 'det_10g' | 'w600k_r50';
  fileName: string;
  bytes: number;
  sha256: string;
  inputName: 'input.1';
  outputNames: readonly string[];
}

export const MODEL_ID = 'insightface/w600k_r50@1';
export const DETECTOR: ModelSpec = {
  key: 'det_10g',
  fileName: 'det_10g.onnx',
  bytes: 16_923_827,
  sha256: '5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91',
  inputName: 'input.1',
  outputNames: ['448', '471', '494', '451', '474', '497', '454', '477', '500'],
};
export const RECOGNISER: ModelSpec = {
  key: 'w600k_r50',
  fileName: 'w600k_r50.onnx',
  bytes: 174_383_860,
  sha256: '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43',
  inputName: 'input.1',
  outputNames: ['683'],
};

export function modelUrl(spec: ModelSpec, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${spec.fileName}`;
}
```

Use `http://10.0.2.2:8765` as the emulator default. Physical devices must receive the development machine's LAN URL through `EXPO_PUBLIC_MODEL_BASE_URL`.

- [ ] **Step 4: Run test and typecheck**

```powershell
pnpm --filter @perigee/face test -- models.test.ts
pnpm --filter @perigee/face typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face/src/onnx/models.ts mobile/packages/face/src/__tests__/models.test.ts
git commit -m "feat(face): add verified model registry"
```

## Task 4: Testable model-cache state machine

**Files:**
- Create: `mobile/packages/face/src/onnx/model-cache.ts`
- Create: `mobile/packages/face/src/onnx/native-model-files.ts`
- Create: `mobile/packages/face/src/__tests__/model-cache.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Use an in-memory adapter and cover:

```ts
it('reuses a cached file only after size and sha256 both match');
it('deletes a corrupt cached file before downloading');
it('downloads to a partial path and promotes only after verification');
it('deletes a failed partial after a digest mismatch');
it('reports bytes received and total bytes');
it('serialises concurrent requests for the same model');
```

The injectable interface is:

```ts
export interface ModelFileAdapter {
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  sha256(path: string): Promise<string>;
  download(url: string, path: string, onProgress: (received: number) => void): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  modelPath(fileName: string): string;
}
```

- [ ] **Step 2: Confirm the red state**

```powershell
pnpm --filter @perigee/face test -- model-cache.test.ts
```

- [ ] **Step 3: Implement `ensureModel`**

Public contract:

```ts
export interface ModelProgress {
  key: ModelSpec['key'];
  phase: 'checking' | 'downloading' | 'verifying' | 'ready';
  receivedBytes: number;
  totalBytes: number;
}

export async function ensureModel(
  spec: ModelSpec,
  baseUrl: string,
  files: ModelFileAdapter,
  onProgress?: (progress: ModelProgress) => void,
): Promise<string>;
```

Use a module-level `Map<ModelSpec['key'], Promise<string>>` to prevent duplicate concurrent downloads. Compare lowercase 64-character digests exactly after validating their format.

- [ ] **Step 4: Implement the React Native adapter**

`native-model-files.ts` must use `ReactNativeBlobUtil.fs.dirs.DocumentDir`, `.config({ path, overwrite: true })`, `.fetch('GET', url)`, `.progress()`, `fs.stat`, `fs.hash(path, 'sha256')`, `fs.mv`, and `fs.unlink`. Never call `File.bytes()` or `response.arrayBuffer()` for a model.

- [ ] **Step 5: Run tests and typecheck**

```powershell
pnpm --filter @perigee/face test -- model-cache.test.ts
pnpm --filter @perigee/face typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/packages/face/src/onnx/model-cache.ts mobile/packages/face/src/onnx/native-model-files.ts mobile/packages/face/src/__tests__/model-cache.test.ts
git commit -m "feat(face): add verified native model cache"
```

## Task 5: Two-app native runtime diagnostics

**Files:**
- Create: `mobile/packages/face/src/onnx/runtime-diagnostics.ts`
- Modify: `mobile/packages/face/src/index.ts`
- Modify: `mobile/apps/field/app/settings/diagnostics.tsx`
- Modify: `mobile/apps/enroll/app/settings/diagnostics.tsx`

- [ ] **Step 1: Implement a shared diagnostic probe**

Export:

```ts
export interface RuntimeDiagnostic {
  onnxRuntimeLoaded: boolean;
  skiaLoaded: boolean;
  detectorReady: boolean;
  recogniserReady: boolean;
  modelId: string;
  detectorOutputs: string[];
  recogniserOutputs: string[];
  failures: string[];
}

export async function diagnoseRuntime(
  baseUrl: string,
  onProgress?: (progress: ModelProgress) => void,
): Promise<RuntimeDiagnostic>;
```

The function dynamically imports ONNX Runtime and Skia, calls `ensureModel` for both specs, opens CPU sessions, and compares the runtime-discovered names to the registry. It releases sessions on failure.

- [ ] **Step 2: Render the shared result in both apps**

Each diagnostics screen needs a `VERIFY FACE RUNTIME` button, progress bytes, exact failure text, and the discovered input/output names. A failure stays visible and may not select fixture mode automatically.

- [ ] **Step 3: Typecheck**

```powershell
pnpm --filter @perigee/face typecheck
pnpm --filter @perigee/field typecheck
pnpm --filter @perigee/enroll typecheck
```

- [ ] **Step 4: Build and install both debug apps**

Start the local model server, then run:

```powershell
testing\face-models\.venv\Scripts\python.exe testing/face-models/prepare_models.py serve --host 0.0.0.0 --port 8765
cd mobile/apps/field; pnpm android
cd ../enroll; pnpm android
```

On `Pixel_7_API_35`, open both diagnostics screens and require all four booleans to be true.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face/src mobile/apps/field/app/settings/diagnostics.tsx mobile/apps/enroll/app/settings/diagnostics.tsx
git commit -m "feat(face): verify native runtime in both apps"
```

## Completion gate

- Official archive and both model digests verified from a clean download.
- No `.onnx` or archive tracked by Git.
- Both applications autolink ONNX Runtime, Skia, and Blob Util.
- Both app packages download, hash, and open both sessions in the emulator.
- A corrupt cached model is rejected by automated tests and device diagnostics.

# ONNX Face Engine and Synthetic Self-Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn decoded images into verified SCRFD detections and ArcFace embeddings on Android, and prove the engine with a reproducible synthetic face corpus.

**Architecture:** `@perigee/face` owns model sessions and preprocessing. React Native adapters load pixels with Skia and models through the runtime from the model plan; the mathematical kernels from the face-math plan remain platform-free. The normal app provider selects the ONNX engine, while the fixture engine is reachable only from a clearly labelled diagnostic route.

**Tech Stack:** TypeScript 5.9, React Native 0.81, Expo SDK 54 development builds, React Native Skia 2.2.12, ONNX Runtime React Native 1.24.3, Vitest 3, Python 3.12 verification utilities.

---

## Task 1: Define and generate the synthetic evaluation corpus

**Files:**
- Create: `testing/face-fixtures/README.md`
- Create: `testing/face-fixtures/prompts.json`
- Create: `testing/face-fixtures/manifest.json`
- Create: `testing/face-fixtures/scripts/validate_manifest.py`
- Create: `testing/face-fixtures/tests/test_manifest.py`

- [ ] **Step 1: Write the failing manifest tests**

The tests must require six fully synthetic adult identities named `synth-01` through `synth-06`. Identities `synth-01` through `synth-05` each have six enrollment images (`frontal-1`, `frontal-2`, `left-1`, `left-2`, `right-1`, `right-2`) and three probe images. `synth-06` has three probe images only and is the negative identity that must never be enrolled. Add four non-identity controls: `no-face`, `two-faces`, `blurred-face`, and `dark-face`.

Each manifest entry must contain `path`, `identity`, `use`, `pose`, `sha256`, `width`, `height`, and `synthetic: true`. Tests reject duplicate hashes, missing files, non-SHA-256 digests, images below 512 x 512, or a manifest containing a real person's name.

- [ ] **Step 2: Run the tests and confirm they fail because the corpus is absent**

Run: `backend\.venv\Scripts\python.exe -m pytest testing/face-fixtures/tests/test_manifest.py -q`

Expected: FAIL with missing `testing/face-fixtures/manifest.json` or missing fixture images.

- [ ] **Step 3: Generate the images with the `imagegen` skill**

Before generation, read and follow the `imagegen` skill. Generate fictional, photorealistic adults with no celebrity resemblance, no names, neutral backgrounds, consistent identity across variants, realistic illumination differences, and the exact pose inventory. Store only generated artifacts under `testing/face-fixtures/images/`; do not download or use a real person's photograph.

`prompts.json` records the base identity prompt, per-shot variation, generation date, and tool. `validate_manifest.py` calculates file dimensions and hashes and emits deterministic, sorted JSON.

- [ ] **Step 4: Run the manifest tests**

Run: `backend\.venv\Scripts\python.exe -m pytest testing/face-fixtures/tests/test_manifest.py -q`

Expected: PASS for 52 files: 45 positive-identity images, three negative probes, and four controls.

- [ ] **Step 5: Commit the corpus metadata and images**

```powershell
git add testing/face-fixtures
git commit -m "test: add synthetic face evaluation corpus"
```

---

## Task 2: Decode image URIs into deterministic pixel buffers

**Files:**
- Create: `mobile/packages/face/src/native/decodeImage.ts`
- Create: `mobile/packages/face/src/native/decodeImage.test.ts`
- Modify: `mobile/packages/face/package.json`
- Modify: `mobile/pnpm-lock.yaml`

- [ ] **Step 1: Add Skia and write failing adapter tests**

Define an injected `ImageCodec` so unit tests do not require native Skia:

```ts
export interface DecodedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}

export interface ImageCodec {
  decode(uri: string): Promise<DecodedImage>;
}
```

Tests require rejection of zero dimensions, truncated `width * height * 4` buffers, and unavailable image data. They require that a valid codec result is copied into a stable `Uint8Array` rather than retaining a native view.

- [ ] **Step 2: Run the package test and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/face test -- decodeImage.test.ts`

Expected: FAIL because `native/decodeImage` does not exist.

- [ ] **Step 3: Implement the Skia codec**

Use `Data.fromURI(uri)`, `Image.MakeImageFromEncoded`, `image.readPixels`, and RGBA8888/unpremultiplied color settings. Throw typed `FaceEngineError` values with codes `IMAGE_READ_FAILED`, `IMAGE_DECODE_FAILED`, or `PIXEL_READ_FAILED`. Dispose native image/data objects when the installed Skia API exposes disposal.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/face test -- decodeImage.test.ts`

Run: `pnpm --dir mobile --filter @perigee/face typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face mobile/pnpm-lock.yaml
git commit -m "feat(face): decode captured images with Skia"
```

---

## Task 3: Implement the SCRFD and ArcFace session pipeline

**Files:**
- Create: `mobile/packages/face/src/onnx/engine.ts`
- Create: `mobile/packages/face/src/onnx/engine.test.ts`
- Create: `mobile/packages/face/src/errors.ts`
- Modify: `mobile/packages/face/src/types.ts`
- Modify: `mobile/packages/face/src/index.ts`
- Modify: `mobile/packages/face/package.json`
- Modify: `mobile/pnpm-lock.yaml`

- [ ] **Step 1: Write failing orchestration tests with fake ONNX sessions**

Inject a minimal session boundary:

```ts
export interface TensorValue {
  data: Float32Array;
  dims: readonly number[];
}

export interface InferenceSessionLike {
  run(feeds: Record<string, TensorValue>): Promise<Record<string, TensorValue>>;
}
```

Tests must verify:

- the detector input is `[1, 3, 640, 640]` under the real input name `input.1`;
- all nine real outputs (`448`, `471`, `494`, `451`, `474`, `497`, `454`, `477`, `500`) reach the SCRFD decoder;
- zero faces throws `NO_FACE`; two accepted faces throws `MULTIPLE_FACES`;
- five landmarks drive the 112 x 112 alignment;
- recognizer input is `[1, 3, 112, 112]` under `input.1`;
- output `683` is exactly 512 finite floats and is L2-normalized;
- model ID is exactly `insightface/w600k_r50@1`;
- no raw pixels or embeddings are logged.

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `pnpm --dir mobile --filter @perigee/face test -- engine.test.ts`

Expected: FAIL because `onnx/engine` does not exist.

- [ ] **Step 3: Implement `OnnxFaceEngine`**

The constructor receives verified model paths, a `SessionFactory`, clock, codec, and engine options. `init()` creates detector and recognizer sessions once, requests CPU/XNNPACK first, and reports the provider actually selected. Concurrent callers share one initialization promise; failure clears the promise so a deliberate retry can work.

`embedUri(uri)` performs decode, letterbox to 640, detector tensor conversion, SCRFD inference, single-face selection, quality calculation, similarity alignment, recognizer inference, finite/dimension validation, and L2 normalization. Return the landmark-derived quality report and total latency. Keep `embed(FaceInput)` for raw-pixel compatibility and extend `FaceInput` with an optional `uri`.

- [ ] **Step 4: Run engine, package, and workspace checks**

Run: `pnpm --dir mobile --filter @perigee/face test -- engine.test.ts`

Run: `pnpm --dir mobile --filter @perigee/face test`

Run: `pnpm --dir mobile --filter @perigee/face typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face mobile/pnpm-lock.yaml
git commit -m "feat(face): run SCRFD and ArcFace inference"
```

---

## Task 4: Make the real engine the application default

**Files:**
- Create: `mobile/packages/face/src/native/createFaceEngine.ts`
- Create: `mobile/packages/face/src/native/createFaceEngine.test.ts`
- Modify: `mobile/packages/face/src/index.ts`
- Modify: `mobile/apps/enroll/src/providers/AppProviders.tsx`
- Modify: `mobile/apps/field/src/providers/AppProviders.tsx`
- Create: `mobile/apps/enroll/src/providers/AppProviders.test.tsx`
- Create: `mobile/apps/field/src/providers/AppProviders.test.tsx`

- [ ] **Step 1: Write failing provider-selection tests**

Normal application startup must call `createOnnxFaceEngine`; it must never import or instantiate `createFixtureEngine`. A caller may obtain the fixture engine only through `createDiagnosticFixtureEngine`, whose return type carries `diagnosticOnly: true`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/enroll test -- AppProviders.test.tsx`

Run: `pnpm --dir mobile --filter @perigee/field test -- AppProviders.test.tsx`

Expected: FAIL before the provider is wired.

- [ ] **Step 3: Implement a shared face-engine context**

Expose state `uninitialized | preparing | ready | error`, the `FaceEngine`, model download progress, retry, and the last diagnostic report. Do not block the whole app on download; capture screens render a model-preparation card and disable biometric submission until ready.

- [ ] **Step 4: Run both app suites and typechecks**

Run: `pnpm --dir mobile --filter @perigee/enroll test && pnpm --dir mobile --filter @perigee/field test`

Run: `pnpm --dir mobile check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/enroll mobile/apps/field mobile/packages/face
git commit -m "feat(mobile): provide verified ONNX face engine"
```

---

## Task 5: Implement a reproducible native self-test

**Files:**
- Create: `mobile/packages/face/src/selftest.ts`
- Create: `mobile/packages/face/src/selftest.test.ts`
- Modify: `mobile/apps/enroll/app/settings/diagnostics.tsx`
- Modify: `mobile/apps/field/app/settings/diagnostics.tsx`

- [ ] **Step 1: Write failing report tests**

Given labelled embedding results, test cosine pairs, per-image unit norms, dimension/finite checks, same-identity minimum, cross-identity maximum, p50/p95 latency, control-image error codes, model hashes, provider, app build, and timestamps. The gate passes only when all declared invariants pass; accuracy thresholds are recorded as experimental evidence, not presented as production guarantees.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/face test -- selftest.test.ts`

Expected: FAIL because `selftest.ts` is absent.

- [ ] **Step 3: Implement the report and diagnostics controls**

The diagnostic screens download/verify models, run all packaged synthetic samples, render individual failures, and export JSON with no source pixels and no embeddings. Export only hashes, labels, quality, similarities, errors, thresholds, timing, and runtime metadata.

- [ ] **Step 4: Run package and app tests**

Run: `pnpm --dir mobile --filter @perigee/face test`

Run: `pnpm --dir mobile check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face mobile/apps/enroll mobile/apps/field
git commit -m "feat(face): add synthetic native self-test"
```

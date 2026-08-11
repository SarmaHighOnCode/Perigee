# Face Recognition End-to-End Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:systematic-debugging for unexpected failures and superpowers:verification-before-completion before reporting success. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce fresh, reproducible evidence that both Android apps create valid ArcFace vectors and that the backend stores and searches them through pgvector using only synthetic identities.

**Architecture:** Verification is layered: unit/contracts, Python ONNX oracle, Android native self-test, Enroll-to-database writes, Field-to-search-to-decision, then full regressions. Every result is written to a timestamped evidence directory with exact hashes and commands; a physical-device checklist remains separate from emulator proof.

**Tech Stack:** Android SDK/ADB/emulator, Expo development builds, ONNX Runtime React Native, Python 3.12 + ONNX Runtime/OpenCV, FastAPI, PostgreSQL 17 + pgvector, pytest, Vitest.

---

## Task 1: Build an independent Python model oracle

**Files:**
- Create: `testing/face-oracle/requirements.txt`
- Create: `testing/face-oracle/oracle.py`
- Create: `testing/face-oracle/test_oracle.py`
- Create: `testing/face-oracle/README.md`

- [ ] **Step 1: Write failing oracle contract tests**

Pin the isolated oracle environment to:

```text
numpy==2.2.1
onnxruntime==1.24.3
opencv-python-headless==4.13.0.92
pytest==8.3.4
```

Install only the headless OpenCV wheel; the environment must not also contain `opencv-python` or either contrib wheel because those packages share the `cv2` namespace.

The CLI accepts detector path, recognizer path, corpus manifest, and output JSON. Test exact ONNX input/output metadata, SHA-256 values, 512-dimensional finite normalized embeddings, stable output ordering, control-image error codes, and absence of raw vectors from the exported report.

- [ ] **Step 2: Create the isolated environment, run, and confirm failure**

```powershell
python -m venv testing/face-oracle/.venv
testing\face-oracle\.venv\Scripts\python.exe -m pip install -r testing/face-oracle/requirements.txt
testing\face-oracle\.venv\Scripts\python.exe -m pytest testing/face-oracle/test_oracle.py -q
```

Expected: FAIL because the oracle is absent.

- [ ] **Step 3: Implement the oracle independently**

Use OpenCV for decode/warp and `onnxruntime==1.24.3` for inference. Reimplement preprocessing and SCRFD decode directly from the approved design rather than importing TypeScript. Write image-hash keyed results containing detection count, landmarks, quality, embedding norm, pair similarities, and latency; omit embedding arrays and pixels.

- [ ] **Step 4: Run it against the clean official models and corpus**

Use the dedicated environment from Step 2 so the backend remains free of image/model runtime dependencies:

```powershell
testing\face-oracle\.venv\Scripts\python.exe -m pytest testing/face-oracle/test_oracle.py -q
```

```powershell
testing\face-oracle\.venv\Scripts\python.exe testing/face-oracle/oracle.py `
  --detector "$env:TEMP\perigee-buffalo-l\models\det_10g.onnx" `
  --recognizer "$env:TEMP\perigee-buffalo-l\models\w600k_r50.onnx" `
  --manifest testing/face-fixtures/manifest.json `
  --output artifacts/face-verification/python-oracle.json
```

Expected: exit 0 and a report whose model hashes are `5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91` and `4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43`.

- [ ] **Step 5: Commit**

```powershell
git add testing/face-oracle
git commit -m "test: add independent ArcFace model oracle"
```

---

## Task 2: Build and run both Android native self-tests

**Files:**
- Create: `scripts/verify_face_android.ps1`
- Create: `docs/testing/face-emulator-checklist.md`
- Output: `artifacts/face-verification/android-enroll.json`
- Output: `artifacts/face-verification/android-field.json`

- [ ] **Step 1: Implement the bounded verification script**

The script verifies `ANDROID_HOME` or uses `E:\Android\Sdk`, starts `Pixel_7_API_35` when needed, waits for `sys.boot_completed=1`, verifies exactly one target emulator, builds both development apps, installs them, serves the two models over the emulator-reachable host, and runs each diagnostic self-test. It must fail on a missing report, mismatched model hash, non-512 dimension, non-finite vector, norm outside `1 ± 1e-3`, or failed control case.

Do not silently accept a connected unrelated device. Do not erase AVD data.

- [ ] **Step 2: Build both native apps**

Run: `pnpm --dir mobile --filter @perigee/enroll android`

Run: `pnpm --dir mobile --filter @perigee/field android`

Expected: both debug builds install and launch without native-module linkage errors.

- [ ] **Step 3: Import the packaged synthetic images**

Use `adb push` into a test-readable directory or a debug-only asset importer. No real internet face is permitted. Run diagnostics in Enroll and Field, export both reports, and pull them into `artifacts/face-verification/`.

- [ ] **Step 4: Compare native results to the Python oracle**

For every accepted image, require the same face count and cosine similarity of at least `0.999` between native and Python embeddings when preprocessing is byte-identical. If image decoders differ, compare aligned RGB tensors first; do not loosen thresholds until the source of divergence is documented.

- [ ] **Step 5: Record emulator evidence**

Capture app version, ABI, Android API, ONNX Runtime version/provider, model hashes, corpus manifest hash, pass/fail thresholds, latencies, and screenshots. Clearly label this emulator evidence, not physical-device performance evidence.

---

## Task 3: Start and verify the backend vector database

**Files:**
- Create: `backend/scripts/verify_face_schema.py`
- Create: `backend/tests/test_face_pipeline_integration.py`
- Output: `artifacts/face-verification/backend-schema.json`

- [ ] **Step 1: Write the failing live-database integration test**

Under the opt-in marker/env used by existing database integration tests, assert the `vector` extension exists, `face_embedding.embedding` is `vector(512)`, HNSW indexes exist, and `(person_id, model_id, media_id)` is unique. Insert two synthetic people with multiple embeddings each and prove search returns one best row per person.

- [ ] **Step 2: Provision or select a disposable PostgreSQL database**

Use the repository's `backend/scripts/setup_database.py` with an explicit `DATABASE_URL`. The database must be disposable synthetic test data only. Verify the connection target before migrations; never point this test at an unknown or shared database.

- [ ] **Step 3: Run migrations and schema verification**

Run: `backend\.venv\Scripts\python.exe backend/scripts/setup_database.py`

Run: `backend\.venv\Scripts\python.exe backend/scripts/verify_face_schema.py --output artifacts/face-verification/backend-schema.json`

Expected: all eight migrations applied and pgvector invariants pass.

- [ ] **Step 4: Run the live integration test**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_face_pipeline_integration.py -q`

Expected: PASS with no skipped test when `DATABASE_URL` is set.

- [ ] **Step 5: Commit verification code**

```powershell
git add backend/scripts/verify_face_schema.py backend/tests/test_face_pipeline_integration.py
git commit -m "test(backend): verify multi-embedding pgvector search"
```

---

## Task 4: Exercise Enroll to pgvector with five synthetic identities

**Files:**
- Create: `testing/e2e/face_pipeline.py`
- Create: `testing/e2e/test_face_pipeline.py`
- Output: `artifacts/face-verification/enrollment-e2e.json`

- [ ] **Step 1: Write failing API-pipeline tests**

Use an injectable HTTP client and assert five person creations, 30 media commits, and 30 embedding writes. Verify every embedding references its unique media ID and model ID, then query the database read-only to confirm five people and six embeddings per person.

- [ ] **Step 2: Run and confirm failure**

Run: `backend\.venv\Scripts\python.exe -m pytest testing/e2e/test_face_pipeline.py -q`

Expected: FAIL because the runner is absent.

- [ ] **Step 3: Run through the Enroll app first**

For `synth-01`, import the six images in the emulator, submit, and capture the receipt. Use the API runner only for the remaining four identities to make the repeated setup deterministic and fast. The runner consumes embeddings produced by the verified native diagnostic export; it must not generate substitute random vectors.

- [ ] **Step 4: Verify database contents**

Assert 30 distinct media IDs, 30 512-dimensional unit embeddings, one model ID, expected quality fields, and audit actions. Export IDs/hashes/counts only.

- [ ] **Step 5: Commit the runner**

```powershell
git add testing/e2e
git commit -m "test: add synthetic enrollment pipeline runner"
```

---

## Task 5: Exercise Field search and the decision boundary

**Files:**
- Modify: `testing/e2e/face_pipeline.py`
- Modify: `testing/e2e/test_face_pipeline.py`
- Output: `artifacts/face-verification/search-e2e.json`

- [ ] **Step 1: Add failing ranking tests**

For each enrolled identity, aggregate its three probes, POST one search, and require that identity to appear at rank 1. For `synth-06`, require no candidate above the backend threshold. Assert the server response uses `candidates` and never a `matched` boolean.

- [ ] **Step 2: Run one complete Field emulator flow**

Import the three probes for `synth-01`, submit search, inspect ranked candidates, record a human decision, and prove the three pending probe values are cleared after the decision response. Capture request/search IDs and screenshots.

- [ ] **Step 3: Run all synthetic probes through the API runner**

Run: `backend\.venv\Scripts\python.exe testing/e2e/face_pipeline.py --verify-search --output artifacts/face-verification/search-e2e.json`

Expected: five positive identity rank-1 checks, one negative check, and write-once decision/audit checks pass.

- [ ] **Step 4: Investigate failures without threshold fitting**

Use `superpowers:systematic-debugging`. First compare hashes, aligned tensors, native/Python embeddings, database rows, SQL distance ordering, and model IDs. Do not tune thresholds against the six evaluation identities; add a separately generated development set if calibration is required.

---

## Task 6: Run full regressions and publish the evidence report

**Files:**
- Create: `docs/testing/2026-08-11-face-verification-report.md`
- Create: `docs/testing/physical-device-face-checklist.md`
- Output: `artifacts/face-verification/commands.txt`

- [ ] **Step 1: Run all mobile checks**

Run: `pnpm --dir mobile check`

Expected: every workspace package/app test and typecheck passes.

- [ ] **Step 2: Run all backend checks**

```powershell
backend\.venv\Scripts\ruff.exe check backend
backend\.venv\Scripts\ruff.exe format --check backend
backend\.venv\Scripts\pyright.exe backend
backend\.venv\Scripts\python.exe -m pytest backend/tests -q
```

Expected: lint, format, typecheck, and test suite pass; the live database test is not skipped in the evidence run.

- [ ] **Step 3: Build release variants**

Run `pnpm --dir mobile --filter @perigee/enroll prebuild` and `pnpm --dir mobile --filter @perigee/field prebuild`, then run each app's `build:release` script with the generated Gradle wrapper. Record APK hashes and sizes. The generated `android/` directories remain ignored. A build success is required; release signing/distribution is outside this hackathon scope.

- [ ] **Step 4: Write the report from fresh outputs**

The report separates proven facts from limitations. Include exact commits, model/archive hashes, corpus hash, environment, commands, unit totals, native self-test results for both apps, pgvector counts, positive/negative search outcomes, timings, screenshots, and known limitations. State that synthetic emulator results do not establish real-world accuracy, fairness, spoof resistance, or physical-device performance.

- [ ] **Step 5: Add the physical-device capability checklist**

Cover clean model download, airplane-mode cached startup, rear/front camera rotation, memory pressure, thermal throttling, three Android ABI/device classes, low light, multiple faces, corrupted model recovery, and report export. Leave unchecked items honestly unchecked until a real device is available.

- [ ] **Step 6: Apply the completion gate**

Read and follow `superpowers:verification-before-completion`. Do not claim the goal is achieved unless both apps have fresh native evidence, Enroll wrote six media-bound embeddings for at least one identity, Field searched a three-image aggregate, pgvector returned the expected synthetic identity, the negative case passed, and all regressions are green.

- [ ] **Step 7: Commit evidence and documentation**

```powershell
git add docs/testing artifacts/face-verification scripts/verify_face_android.ps1
git commit -m "test: document verified facial recognition pipeline"
```

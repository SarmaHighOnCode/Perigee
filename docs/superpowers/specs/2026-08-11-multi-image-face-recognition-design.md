# Multi-Image On-Device Face Recognition Design

**Status:** Approved architecture

**Date:** 2026-08-11

**Scope:** Synthetic-data, non-commercial research and hackathon demonstration only

## 1. Goal

Perigee Field and Perigee Enroll will share a real on-device face pipeline that converts captured
images into 512-dimensional ArcFace embeddings and submits those vectors to the existing FastAPI
and PostgreSQL/pgvector backend.

The completed flow is:

```text
image URI
  -> native image decode
  -> SCRFD face detection and five landmarks
  -> single-face and quality validation
  -> five-point similarity alignment to 112 x 112
  -> ArcFace w600k_r50 inference
  -> L2-normalised 512-D embedding
  -> multi-image consistency and aggregation
  -> backend enrolment or ranked-candidate search
```

This prototype remains a ranked-candidate decision-support system. It does not return or display an
automatic match assertion. A human must adjudicate every Field search through the existing
write-once decision endpoint.

## 2. Scope boundaries

### Included

- Android local native builds for both Expo SDK 54 applications.
- SCRFD face detection and five-landmark output.
- ArcFace `w600k_r50` embeddings through ONNX Runtime React Native.
- Multiple accepted images in both Enroll and Field.
- Per-image enrolment templates stored in pgvector.
- Robust multi-image probe aggregation in Field.
- Model acquisition, raw-file SHA-256 verification, caching, progress, and recovery.
- Synthetic identities and controlled same-identity/different-identity evaluation.
- Emulator execution and a diagnostics flow that can be run unchanged on a physical Android device.
- End-to-end enrolment, vector search, ranked candidates, and human decision against PostgreSQL.

### Excluded

- Real biometric records or identifiable internet photographs.
- Production or commercial use of InsightFace pretrained weights.
- Liveness and presentation-attack detection.
- Authentication, RBAC, or jurisdiction controls beyond the existing device-key gate.
- Automatic identity assertions.
- Server-side image inference or storage of a Field probe photograph.
- Accuracy or latency claims derived only from an emulator.

The InsightFace source code and pretrained weights have different terms. The code is MIT, while
the supplied pretrained model packs are restricted to non-commercial research unless separately
licensed. The app and documentation must preserve this distinction.

## 3. Runtime and dependency architecture

The shared implementation lives in `mobile/packages/face`. Both applications list the native
packages as direct dependencies so Expo autolinking sees them inside each Android application:

| Dependency | Version | Responsibility |
| --- | --- | --- |
| `onnxruntime-react-native` | `1.24.3` | Detector and recogniser inference |
| `@shopify/react-native-skia` | `2.2.12` | Native decode, resize, drawing, and pixel reads |
| `expo-file-system` | existing SDK 54 version | Private model cache and atomic file replacement |
| `expo-crypto` | existing SDK 54 version | Raw-file SHA-256 integrity verification |
| `react-native-vision-camera` | existing `5.2.2` | High-quality still capture |

`@perigee/face` owns all JavaScript and TypeScript inference logic. Field and Enroll own only
capture state, progress UI, and translation from their domain records into the shared engine API.

Expo Go is unsupported because ONNX Runtime, Skia, and VisionCamera are native modules. Development,
emulator, and device verification use committed native Android projects and custom local builds.

## 4. Model contract and distribution

The model pair comes from the InsightFace `buffalo_l` pack:

| Key | File | Role | Input | Output used |
| --- | --- | --- | --- | --- |
| `scrfd_10g` | `det_10g.onnx` | Face boxes and five landmarks | RGB NCHW, 640 x 640 | SCRFD score, box, landmark heads |
| `arcface_r50` | `w600k_r50.onnx` | Identity embedding | aligned RGB NCHW, 112 x 112 | 512 floats |

The repository stores a model manifest, not the model binaries. Each manifest entry contains:

- stable model key and application model ID;
- HTTPS download URL under the approved InsightFace model distribution;
- expected byte count;
- raw-file SHA-256 digest;
- verified input and output names and shapes;
- preprocessing mean, scale, channel order, and layout.

Models download into an application-private `perigee-models` directory. A download is written to a
temporary file, hashed as raw bytes, and renamed into place only after the digest matches. A cached
model is hashed before every new inference-session lifecycle. A mismatch deletes the file and
requires a clean redownload. The two models are never committed to Git or bundled into an APK.

ONNX Runtime sessions are created once per app process. For the non-quantised models the engine
tries XNNPACK first, then CPU. NNAPI may be added only after the diagnostics benchmark proves it is
both compatible and faster on the target device; driver-specific acceleration is not assumed.

The only model ID sent to the backend is `insightface/w600k_r50@1`. The server already rejects any
other embedding space.

## 5. Shared face-engine components

`mobile/packages/face/src/onnx` is split by responsibility:

| Module | Responsibility |
| --- | --- |
| `models.ts` | Immutable model manifest and tensor metadata |
| `download.ts` | Atomic download, raw SHA-256, cache validation, progress |
| `decode.ts` | URI decode, EXIF orientation, detector letterbox, full-resolution pixels |
| `tensor.ts` | RGBA/RGB conversion, HWC-to-NCHW layout, normalisation, L2 operations |
| `scrfd.ts` | Anchor generation, score/box/landmark decoding, NMS |
| `align.ts` | Four-degree-of-freedom similarity transform and aligned 112 x 112 crop |
| `signals.ts` | Face size, blur, brightness, pose, detector score, face count |
| `aggregate.ts` | Same-subject consistency, medoid selection, quality-weighted centroid |
| `engine.ts` | Session lifecycle and the complete per-image embedding pipeline |
| `selftest.ts` | Synthetic model, accuracy-separation, and latency diagnostics |

Pure mathematics and tensor modules have no React Native imports. They run under Vitest on the
development machine. Decode, model download, and inference-session creation are covered by device
integration tests and the diagnostics screen.

The existing fixture engine remains available for CI tests that do not load native modules. It is
selected only by an explicit fixture mode. A successful model integrity check and device self-test
are required before the application records the real engine as ready.

## 6. Per-image inference

For each capture, the engine performs these steps:

1. Decode the original image and honour its orientation metadata.
2. Letterbox to 640 x 640 without stretching.
3. Run SCRFD and decode all score, box, and landmark heads.
4. Apply confidence filtering and non-maximum suppression.
5. Require exactly one usable face. Zero faces and multiple faces are separate errors.
6. Map the selected box and landmarks back into original-image coordinates.
7. Derive face size, yaw, pitch, blur, brightness, and detector confidence.
8. Apply existing hard quality floors and return a specific coaching error when rejected.
9. Estimate a five-point similarity transform with no shear.
10. Warp the face into the ArcFace 112 x 112 template.
11. Convert the aligned crop to the model's RGB NCHW float tensor.
12. Run `w600k_r50.onnx` and require exactly 512 finite output values.
13. L2-normalise the output and require its norm to remain within `[0.99, 1.01]`.

Every successful result carries the model ID, quality report, detector and recogniser timing, and
the final unit vector. The original Field image is not uploaded or sent to the backend.

## 7. Multi-image aggregation

### 7.1 Shared consistency algorithm

Aggregation receives two or more accepted unit vectors with their quality scores:

1. Build the full pairwise cosine-similarity matrix.
2. Select the medoid: the vector with the greatest sum of similarity to the others.
3. Keep vectors whose cosine similarity to the medoid is at least `0.45`.
4. Require at least two retained vectors.
5. Weight each retained vector by `max(quality.score, 0.01)`.
6. Sum the weighted vectors and L2-normalise the result.
7. Report the minimum included quality as the aggregate quality sent to the server.

The `0.45` consistency floor is deliberately below the self-test same-identity gate of `0.55` so a
moderate pose change can contribute while an unrelated identity is rejected. It is an identity-
consistency guard, not the backend's candidate-band threshold.

### 7.2 Enroll capture policy

Enroll requires six accepted images:

- `frontal-1` and `frontal-2`;
- `left-1` and `left-2`;
- `right-1` and `right-2`.

Each image must pass the stricter enrolment quality floor of `0.60`. Before person submission, all
six embeddings pass the shared consistency algorithm. An outlier blocks submission and identifies
the capture that must be retaken.

After the person and media records are committed, Enroll posts one embedding per committed image,
including that image's `media_id`. The existing unique key `(person_id, model_id, media_id)` makes
retries idempotent and lets the search index preserve pose diversity. The current search query ranks
embeddings and deduplicates candidates by person, so no database migration is required for multiple
templates.

The draft schema advances to version 2. Each capture stores its inference state, quality report,
model ID, embedding checkpoint, media checkpoint, and server embedding ID. A restart resumes from
the last confirmed checkpoint and never recreates a confirmed person, media record, or embedding.

### 7.3 Field capture policy

Field requires three accepted probe images taken in one screening session. The UI coaches a direct
view followed by small left and right pose variations; it does not ask for full profile views.

All three images are embedded locally. The shared consistency algorithm rejects a capture from a
different subject or a badly unstable embedding. At least two consistent vectors are required. The
quality-weighted centroid is sent once to `POST /v1/search`, producing one pending decision and one
audit event rather than three competing searches.

Field keeps capture URIs and per-image embeddings only in volatile screening state. Resetting,
finishing, or abandoning the screening clears them. The backend's existing
`RETAIN_PROBE_EMBEDDING=false` default remains unchanged.

## 8. Application flows

### 8.1 Enroll

```text
identity
  -> six guided captures
  -> per-image quality and embedding
  -> cross-image consistency review
  -> cases and relationships
  -> create person
  -> upload and commit each image
  -> attach each embedding to its media_id
  -> link cases and relationships
  -> complete receipt
```

The review screen shows accepted/rejected state, quality coaching, model readiness, and six
embedding checkpoints. It never displays raw vector values.

### 8.2 Field

```text
attributed shift
  -> three guided captures
  -> per-image quality and embedding
  -> consistency review and aggregate
  -> one backend vector search
  -> ranked candidates
  -> mandatory human decision
```

The synthetic watermark and ranked-candidate language remain permanent. Fixture selection is moved
under diagnostics and is not part of the default search route when the real engine is ready.

### 8.3 Diagnostics

Both apps expose the same diagnostics information:

- model download and digest status;
- model ID and execution provider;
- detector and recogniser input/output metadata;
- same-identity minimum and different-identity maximum over synthetic fixtures;
- p50 and p95 detector, recogniser, and full-pipeline latency;
- embedding dimension, finiteness, and norm;
- full failure reasons.

Field and Enroll each run the engine inside their own Android package. Passing in one app does not
stand in for passing in the other.

## 9. Failure handling

| Failure | Behaviour |
| --- | --- |
| Model offline and not cached | Block recognition, preserve captures, offer retry |
| Model digest mismatch | Delete corrupt file, block session creation, redownload |
| Native module unavailable | Mark device unsupported; never fall back silently to fixtures |
| No face | Request retake with `NO FACE DETECTED` |
| Multiple faces | Request retake with `ONE PERSON ONLY` |
| Low detector confidence | Request closer/steadier capture |
| Face too small | Request closer capture |
| Excessive yaw or pitch | Give direction-specific pose coaching |
| Blur | Request steadier capture |
| Poor brightness | Request more light or shade |
| Non-finite or wrong-size output | Fail inference and record diagnostic details locally |
| Unit norm outside tolerance | Reject before any network call |
| Cross-image inconsistency | Identify the outlier and require a retake |
| Backend model mismatch | Block and show configuration error; never retry under another ID |
| Network failure after ambiguous write | Preserve checkpoint and require recovery before retry |

Fixture mode is never an automatic error fallback. A native/model failure must remain visible,
otherwise a demo can accidentally present deterministic fixture vectors as recognition.

## 10. Synthetic verification corpus

The test corpus contains generated faces only. It is committed with a machine-readable manifest
that records synthetic provenance, identity label, capture variation, expected relationship, image
dimensions, and SHA-256.

The minimum corpus contains five synthetic identities. Each identity has:

- two frontal enrolment images;
- two left-pose enrolment images;
- two right-pose enrolment images;
- three independent Field probe images with lighting, crop, and mild pose variation.

Additional negative fixtures contain a blank scene, two synthetic people, a deliberately blurred
face, an underexposed face, and a corrupted image. No celebrity, stock-photo subject, or scraped
internet face is permitted.

A Python oracle runs the same ONNX models against the corpus to produce model metadata and reference
embeddings. Mobile output is compared with the oracle using cosine similarity rather than exact
float equality because execution providers can differ slightly in floating-point accumulation.

## 11. Verification strategy

### 11.1 Pure automated tests

- SCRFD anchor ordering, distance decoding, landmark decoding, and NMS.
- Similarity-transform recovery and aligned-crop geometry.
- RGB channel order, NCHW layout, detector and recogniser normalisation.
- Blur, brightness, pose, face-size, and hard-floor quality behaviour.
- L2 normalisation, finite-value validation, and zero-vector rejection.
- Medoid selection, outlier rejection, quality weighting, and aggregate norm.
- Enroll schema migration and six-capture readiness.
- Field three-capture state and clearing semantics.
- Submission checkpoint idempotency for six media and six embeddings.
- API client payloads for per-media embeddings and one aggregate search.

### 11.2 Native emulator verification

On `Pixel_7_API_35`, both custom Android apps must:

1. load ONNX Runtime and Skia;
2. download or receive the verified models;
3. process the committed synthetic fixture images;
4. return finite 512-D unit vectors;
5. separate same-identity and different-identity pairs at the self-test gates;
6. complete the Enroll and Field flows without Metro in a release build.

Emulator latency is recorded for debugging only and is not a performance claim.

### 11.3 Backend integration verification

Against PostgreSQL 17 with pgvector:

1. migrate and seed the database;
2. create one synthetic person per corpus identity;
3. attach all six media-linked embeddings to each person;
4. submit each identity's aggregated Field probe;
5. assert the intended synthetic person is ranked first for positive probes;
6. assert unrelated probes do not pass the configured candidate floor;
7. record a human decision and verify the audit chain;
8. prove model IDs, vector dimension, and unit norm are enforced.

The integration report records rank, similarity, band, score gap, ambiguity, and decision outcome.
It does not relabel a ranked candidate as an automatic match.

### 11.4 Physical-device capability gate

The same diagnostics and self-test must run on a real Android handset without code changes. The
device report records Android version, ABI, provider, model digests, memory, p50/p95 latency, and
same/different-identity separation. Until that report exists, the supported claim is functional
emulator inference and a real-device-capable build, not validated handset performance.

## 12. Acceptance criteria

The feature is complete only when all of the following are proven:

- Both apps build with the native face dependencies and launch as custom Android applications.
- Both apps use the real SCRFD and ArcFace engine in their default recognition flows.
- Enroll accepts six images and stores multiple media-linked embeddings for one synthetic person.
- Field accepts three images, rejects inconsistent probes, and sends one normalised aggregate.
- Model files are absent from Git/APKs and accepted only after raw SHA-256 verification.
- Every emitted embedding has 512 finite values and norm within `[0.99, 1.01]`.
- Synthetic same-identity pairs exceed the self-test floor of `0.55`.
- Synthetic different-identity pairs stay below the self-test ceiling of `0.30`.
- PostgreSQL/pgvector returns the intended synthetic identity as rank 1 for every positive probe.
- The negative probe remains below the configured no-candidate floor.
- Human decision and audit-chain behaviour remain intact.
- Mobile tests/typechecks, backend lint/typecheck/tests, Android builds, emulator self-tests, and the
  end-to-end integration test all pass with recorded evidence.
- Documentation states the synthetic-only scope, model licensing boundary, emulator limitation,
  and absence of liveness/authentication.

## 13. Implementation decomposition

This design is implemented through separate, testable plans:

1. Model acquisition, manifest verification, and native-runtime proof in both apps.
2. Pure SCRFD, alignment, tensor, quality, and aggregation implementation.
3. Shared ONNX engine and synthetic self-test corpus.
4. Six-image Enroll state, UI, media-linked embeddings, and backend annotations.
5. Three-image Field state, UI, aggregate search, and decision flow.
6. Android builds, emulator verification, PostgreSQL integration, and evidence report.

Each plan preserves the fixture engine for non-native unit tests but never uses it as an implicit
fallback from a failed real model.

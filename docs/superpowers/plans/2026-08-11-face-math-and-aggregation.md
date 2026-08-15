# Face Math and Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and test all pure detector decoding, alignment, tensor conversion, quality measurement, and multi-image aggregation required by the ONNX engine.

**Architecture:** Every module in this plan operates only on typed arrays and plain objects. React Native, Skia, filesystem, and ONNX session imports are forbidden, allowing deterministic Vitest coverage on Windows and CI before any device inference.

**Tech Stack:** TypeScript 5.9 strict, Float32Array/Uint8Array, Vitest 3.

---

## Task 1: Tensor conversion and vector invariants

**Files:**
- Create: `mobile/packages/face/src/onnx/tensor.ts`
- Create: `mobile/packages/face/src/__tests__/tensor.test.ts`

- [ ] **Step 1: Write failing layout and normalisation tests**

Use a 2 x 1 RGBA image containing red then blue pixels:

```ts
const rgba = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]);
const tensor = rgbaToRgbNchw(rgba, 2, 1, 127.5, 1 / 127.5);
expect(Array.from(tensor)).toEqual([1, -1, -1, -1, -1, 1]);
```

Also assert:

```ts
expect(() => rgbaToRgbNchw(new Uint8Array(3), 1, 1, 0, 1)).toThrow('expected 4 RGBA bytes');
expect(l2Normalise(Float32Array.from([3, 4]))).toEqual(Float32Array.from([0.6, 0.8]));
expect(() => l2Normalise(new Float32Array(512))).toThrow('zero');
expect(() => l2Normalise(Float32Array.from([1, Number.NaN]))).toThrow('non-finite');
expect(l2Norm(l2Normalise(Float32Array.from({ length: 512 }, (_, i) => i + 1)))).toBeCloseTo(1, 6);
```

- [ ] **Step 2: Verify red state**

```powershell
pnpm --filter @perigee/face test -- tensor.test.ts
```

Expected: import fails because `tensor.ts` does not exist.

- [ ] **Step 3: Implement the exact public API**

```ts
export function rgbaToRgbNchw(
  rgba: Uint8Array,
  width: number,
  height: number,
  mean: number,
  scale: number,
): Float32Array;

export function l2Normalise(values: ArrayLike<number>): Float32Array;
export function l2Norm(values: ArrayLike<number>): number;
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function assertEmbedding(values: ArrayLike<number>): void;
```

`assertEmbedding` requires length 512, all finite values, and norm in `[0.99, 1.01]`. The output layout is channel-major R, then G, then B; alpha is ignored.

- [ ] **Step 4: Run test and typecheck**

```powershell
pnpm --filter @perigee/face test -- tensor.test.ts
pnpm --filter @perigee/face typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face/src/onnx/tensor.ts mobile/packages/face/src/__tests__/tensor.test.ts
git commit -m "feat(face): add tensor and embedding invariants"
```

## Task 2: SCRFD decoding and non-maximum suppression

**Files:**
- Create: `mobile/packages/face/src/onnx/scrfd.ts`
- Create: `mobile/packages/face/src/__tests__/scrfd.test.ts`

- [ ] **Step 1: Write failing anchor tests**

Pin the detector's actual geometry:

```ts
expect(anchorCenters(16, 16, 8, 2).slice(0, 6)).toEqual([
  [0, 0], [0, 0], [8, 0], [8, 0], [0, 8], [0, 8],
]);
expect(anchorCenters(640, 640, 8, 2)).toHaveLength(12_800);
expect(anchorCenters(640, 640, 16, 2)).toHaveLength(3_200);
expect(anchorCenters(640, 640, 32, 2)).toHaveLength(800);
```

- [ ] **Step 2: Write failing decode tests**

Create one stride-8 anchor at `(80, 40)` with box distances `[1, 2, 3, 4]` and landmark distances
`[0,0, 1,0, 0.5,1, 0,2, 1,2]`. Assert the decoded box is `(72,24,104,72)` and every landmark is multiplied by the stride and added to the anchor center.

Create overlapping boxes and assert NMS at IoU `0.4` keeps the higher score. Create three outputs per head matching the verified names and assert `decodeDetections` returns boxes sorted descending by confidence.

- [ ] **Step 3: Confirm failure**

```powershell
pnpm --filter @perigee/face test -- scrfd.test.ts
```

- [ ] **Step 4: Implement the decoder**

Export:

```ts
export interface Point { x: number; y: number }
export interface FaceDetection {
  x1: number; y1: number; x2: number; y2: number;
  score: number;
  landmarks: readonly [Point, Point, Point, Point, Point];
}

export const SCRFD_STRIDES = [8, 16, 32] as const;
export const SCRFD_ANCHORS = 2;
export const DETECTION_SCORE_FLOOR = 0.5;
export const NMS_IOU = 0.4;

export function anchorCenters(width: number, height: number, stride: number, anchors: number): Point[];
export function distanceToBox(center: Point, distances: ArrayLike<number>, stride: number): Omit<FaceDetection, 'score' | 'landmarks'>;
export function distanceToLandmarks(center: Point, distances: ArrayLike<number>, stride: number): FaceDetection['landmarks'];
export function intersectionOverUnion(a: FaceDetection, b: FaceDetection): number;
export function nonMaximumSuppression(boxes: FaceDetection[], threshold?: number): FaceDetection[];
export function decodeDetections(outputs: Readonly<Record<string, Float32Array>>, detScale: number): FaceDetection[];
```

Output groups are fixed as scores `448/471/494`, boxes `451/474/497`, landmarks `454/477/500`. Validate every expected output length and throw a named `DetectorOutputError` instead of indexing malformed data.

- [ ] **Step 5: Run tests**

```powershell
pnpm --filter @perigee/face test -- scrfd.test.ts
pnpm --filter @perigee/face typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add mobile/packages/face/src/onnx/scrfd.ts mobile/packages/face/src/__tests__/scrfd.test.ts
git commit -m "feat(face): decode SCRFD boxes and landmarks"
```

## Task 3: Five-point similarity alignment

**Files:**
- Create: `mobile/packages/face/src/onnx/align.ts`
- Create: `mobile/packages/face/src/__tests__/align.test.ts`

- [ ] **Step 1: Write failing transform tests**

Pin the standard ArcFace template:

```ts
export const ARCFACE_TEMPLATE = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
] as const;
```

Tests must recover identity, known scale-plus-translation, and a 15-degree rotation within `1e-4`. A degenerate set with all source points equal must throw `AlignmentError`.

- [ ] **Step 2: Write failing warp tests**

Use a 3 x 3 RGBA fixture with unique pixel values. Assert identity warp preserves pixels and a half-pixel translation uses bilinear interpolation with an opaque black border. Assert the output is exactly `112 * 112 * 4` bytes.

- [ ] **Step 3: Confirm failure**

```powershell
pnpm --filter @perigee/face test -- align.test.ts
```

- [ ] **Step 4: Implement alignment without shear**

Export:

```ts
export interface SimilarityTransform { a: number; b: number; tx: number; ty: number }
export function estimateSimilarityTransform(source: readonly Point[], target?: readonly Point[]): SimilarityTransform;
export function invertSimilarityTransform(transform: SimilarityTransform): SimilarityTransform;
export function warpRgba(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  transform: SimilarityTransform,
  targetWidth?: number,
  targetHeight?: number,
): Uint8Array;
```

The forward transform is `x' = a*x - b*y + tx`, `y' = b*x + a*y + ty`. Solve only these four parameters; affine shear is forbidden.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm --filter @perigee/face test -- align.test.ts
pnpm --filter @perigee/face typecheck
git add mobile/packages/face/src/onnx/align.ts mobile/packages/face/src/__tests__/align.test.ts
git commit -m "feat(face): add five-point ArcFace alignment"
```

## Task 4: Pixel-derived quality signals

**Files:**
- Create: `mobile/packages/face/src/onnx/signals.ts`
- Create: `mobile/packages/face/src/__tests__/signals.test.ts`

- [ ] **Step 1: Write failing measurement tests**

Cover:

- constant black and white images produce mean luma `0` and `255`;
- a checkerboard has higher Laplacian variance than a flat image;
- symmetric landmarks produce yaw and pitch near zero;
- shifting nose and eyes produces correctly signed yaw/pitch;
- face size uses the larger detected-box dimension;
- `toQualitySignals` preserves detector confidence and face count.

- [ ] **Step 2: Confirm failure**

```powershell
pnpm --filter @perigee/face test -- signals.test.ts
```

- [ ] **Step 3: Implement measurements**

```ts
export function meanLuma(rgba: Uint8Array, width: number, height: number): number;
export function laplacianVariance(rgba: Uint8Array, width: number, height: number): number;
export function poseFromLandmarks(points: FaceDetection['landmarks']): { yaw: number; pitch: number };
export function toQualitySignals(
  face: FaceDetection,
  alignedRgba: Uint8Array,
  faceCount: number,
): QualitySignals;
```

Use luma `0.2126R + 0.7152G + 0.0722B` and a four-neighbour Laplacian. Pose is a deterministic landmark heuristic calibrated by tests, not a claimed 3-D head-pose estimator.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm --filter @perigee/face test -- signals.test.ts
pnpm --filter @perigee/face typecheck
git add mobile/packages/face/src/onnx/signals.ts mobile/packages/face/src/__tests__/signals.test.ts
git commit -m "feat(face): derive capture quality from pixels"
```

## Task 5: Robust multi-image aggregation

**Files:**
- Create: `mobile/packages/face/src/onnx/aggregate.ts`
- Create: `mobile/packages/face/src/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write failing aggregation tests**

Define deterministic 512-D unit fixtures and cover:

```ts
it('selects the vector with greatest total cosine as medoid');
it('rejects vectors below 0.45 cosine to the medoid');
it('requires at least two consistent embeddings');
it('weights retained vectors by quality score');
it('returns a finite 512-D unit centroid');
it('reports indexes of rejected captures');
it('uses the minimum included quality as aggregate quality');
```

One test must include two close vectors and one orthogonal vector, expecting the orthogonal index in `rejectedIndexes`.

- [ ] **Step 2: Confirm failure**

```powershell
pnpm --filter @perigee/face test -- aggregate.test.ts
```

- [ ] **Step 3: Implement the approved algorithm**

```ts
export const CONSISTENCY_FLOOR = 0.45;

export interface EmbeddingSample {
  embedding: Float32Array;
  quality: QualityReport;
}

export interface AggregateResult {
  embedding: Float32Array;
  quality: QualityReport;
  medoidIndex: number;
  includedIndexes: number[];
  rejectedIndexes: number[];
  pairwiseCosines: number[][];
}

export class InconsistentIdentityError extends Error {
  readonly rejectedIndexes: number[];
}

export function aggregateEmbeddings(samples: readonly EmbeddingSample[]): AggregateResult;
```

Validate every input with `assertEmbedding`, select the maximum-sum medoid, retain cosine `>= 0.45`, require two, weight by `max(score, 0.01)`, normalise the sum, and copy the worst included quality report while replacing `score` with the minimum included score.

- [ ] **Step 4: Run all pure face tests**

```powershell
pnpm --filter @perigee/face test
pnpm --filter @perigee/face typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/face/src/onnx/aggregate.ts mobile/packages/face/src/__tests__/aggregate.test.ts
git commit -m "feat(face): aggregate consistent multi-image embeddings"
```

## Completion gate

- All pure modules run without React Native imports.
- Actual detector output sizes and names are enforced.
- Alignment uses the five-point ArcFace template and no shear.
- Every output vector is finite, 512-D, and unit-normalised.
- Multi-image aggregation rejects an unrelated capture and returns an auditable pairwise matrix.
- `pnpm --filter @perigee/face test` and typecheck pass.

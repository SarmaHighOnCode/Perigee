# On-Device ONNX Face Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@perigee/face`'s fixture engine with a real on-device pipeline — SCRFD detection → 5-point alignment → ArcFace embedding → L2 normalisation — behind the existing `FaceEngine` interface, plus a `selfTest()` that answers go/no-go on real hardware.

**Architecture:** Skia decodes and rescales frames natively (JS pixel loops on a 640×640 buffer are too slow). ONNX Runtime runs two models. All tensor decoding, alignment maths and quality scoring are **pure functions in separate modules**, so they are unit-testable in vitest without a device; only the two `session.run` calls need hardware.

**Tech Stack:** `onnxruntime-react-native@1.24.3`, `@shopify/react-native-skia`, Expo SDK 54 / RN 0.81, TypeScript strict, vitest.

---

## Read first

| Document | Why |
| --- | --- |
| `docs/04-FACE-PIPELINE.md` | The specification. §1 pipeline, §3 alignment, §4 quality gate, §6 device tiers. |
| `mobile/packages/face/src/types.ts` | **The interfaces you must satisfy exactly.** Do not change them. |
| `mobile/packages/face/src/quality.ts` | Already written. `assessQuality(signals)` and `coachingFor(signals)` exist — you produce the `QualitySignals`, you do not rewrite the scoring. |
| `mobile/packages/face/src/fixture-engine.ts` | The shape your engine must mirror. Keep it; it stays the CI/dev default. |

---

## Hard constraints

1. **Do not modify `src/types.ts`.** `FaceEngine`, `EmbedResult`, `QualitySignals`, `SelfTestReport` are consumed by `apps/field`. Changing them breaks the app.
2. **Do not delete the fixture engine.** CI has no device; the fixture engine is what keeps `pnpm -r test` meaningful.
3. **Do not upgrade Expo past SDK 54.** `onnxruntime-react-native` publishes **no `codegenConfig`** — it is an old-architecture module relying on the legacy interop layer, and RN 0.82 removes the Bridge entirely. Verified 2026-08-11 via `npm view onnxruntime-react-native`.
4. **Never ship a model file in the APK.** ArcFace `w600k_r50` is 166 MB. Download on first launch, verify SHA-256.
5. **The embedding must be L2-normalised before it leaves this package.** The server rejects `‖v‖ ∉ [0.99, 1.01]` with `422 INVALID_EMBEDDING`.
6. **`modelId` must be exactly `insightface/w600k_r50@1`** — the backend allowlist rejects anything else.

---

## File structure

```
mobile/packages/face/src/
├── types.ts                 UNCHANGED
├── quality.ts               UNCHANGED (scoring + coaching already exist)
├── fixture-engine.ts        UNCHANGED (stays the CI/dev default)
├── index.ts                 MODIFY — export the new engine
│
├── onnx/
│   ├── models.ts            model registry: URLs, SHA-256, input specs
│   ├── download.ts          fetch + integrity-check + cache
│   ├── decode.ts            Skia: URI → RGBA pixels, letterbox rescale
│   ├── tensor.ts            RGBA → NCHW Float32Array, mean/std normalise
│   ├── scrfd.ts             anchors, distance2bbox, distance2kps, NMS
│   ├── align.ts             similarity transform + bilinear warp to 112×112
│   ├── signals.ts           blur (Laplacian variance), brightness, pose
│   ├── engine.ts            OnnxFaceEngine implements FaceEngine
│   └── selftest.ts          the go/no-go harness
└── __tests__/
    ├── scrfd.test.ts        pure: anchors, decode, NMS
    ├── align.test.ts        pure: transform maths, warp
    ├── tensor.test.ts       pure: layout, normalisation
    └── signals.test.ts      pure: blur, brightness, pose
```

**Why split this way:** everything except `engine.ts` and `download.ts` is pure and testable on a laptop. That is the difference between a plan you can verify incrementally and one where nothing works until the end.

---

## Task 1: Prove ONNX Runtime loads on a device ⚠️ THE GATE

**Do this before writing anything else.** If it fails, the rest of the plan is void and the fallback is `ENABLE_SERVER_EMBED=true` on a larger host.

**Files:**
- Modify: `mobile/apps/field/package.json`
- Create: `mobile/apps/field/app/diagnostics.tsx`

- [ ] **Step 1: Add the dependencies**

```bash
cd mobile/apps/field
corepack pnpm add onnxruntime-react-native@1.24.3 @shopify/react-native-skia
cd ../.. && corepack pnpm install
```

- [ ] **Step 2: Write a diagnostics screen that only proves the native module resolves**

Create `mobile/apps/field/app/diagnostics.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { palette, space } from '@perigee/design-tokens';

export default function Diagnostics() {
  const [lines, setLines] = useState<string[]>([]);
  const log = (s: string) => setLines((l) => [...l, s]);

  useEffect(() => {
    void (async () => {
      try {
        const ort = await import('onnxruntime-react-native');
        log(`onnxruntime loaded: ${typeof ort.InferenceSession}`);
        log(`available: ${Object.keys(ort).join(', ')}`);
      } catch (e) {
        log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        const { Skia } = await import('@shopify/react-native-skia');
        log(`skia loaded: ${typeof Skia.Data}`);
      } catch (e) {
        log(`SKIA FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>DIAGNOSTICS</Text>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>{l}</Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[2], padding: space[4] },
  title: { color: palette.ink, fontSize: 24, fontWeight: '900' },
  line: { color: palette.ink, fontSize: 12 },
});
```

- [ ] **Step 3: Build a custom dev client and run it on a REAL device**

```bash
cd mobile/apps/field
corepack pnpm exec expo run:android
```

Expected: app installs, navigate to `/diagnostics`, see `onnxruntime loaded: function` and `skia loaded: object`.

> **Expo Go will not work.** These are native modules. If you see `Cannot find native module`, you are in Expo Go — build the dev client.

- [ ] **Step 4: STOP AND REPORT**

If either line says FAILED, stop and report the exact error. Do not continue. The architecture decision changes.

- [ ] **Step 5: Commit**

```bash
git add mobile/apps/field/package.json mobile/apps/field/app/diagnostics.tsx mobile/pnpm-lock.yaml
git commit -m "Add onnxruntime and skia with a native-module load check"
```

---

## Task 2: Model registry

**Files:**
- Create: `mobile/packages/face/src/onnx/models.ts`

- [ ] **Step 1: Obtain the models**

Download the InsightFace `buffalo_l` pack and extract `det_10g.onnx` and `w600k_r50.onnx`. Compute digests:

```bash
sha256sum det_10g.onnx w600k_r50.onnx
```

Upload both to a stable host (Cloudflare R2 public bucket, or a GitHub Release asset on this repo).

> **Licence:** InsightFace model weights are released for **non-commercial research use**. Fine for this prototype; it is on the pre-deployment checklist in `docs/09-COMPLIANCE-INDIA.md` §6 and must be resolved before any real deployment.

- [ ] **Step 2: Write the registry**

Create `mobile/packages/face/src/onnx/models.ts`. Replace the two `sha256` values and both URLs with the real ones from Step 1:

```ts
/**
 * Model registry.
 *
 * The digests are compiled into the signed APK and checked after download. A
 * model file swapped in transit is a supply-chain attack against the
 * recognition system itself — docs/04 §2.
 */
export interface ModelSpec {
  readonly key: string;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly inputName: string;
  readonly inputSize: number;
}

export const DETECTOR: ModelSpec = {
  key: 'scrfd_10g',
  url: 'https://REPLACE-ME/det_10g.onnx',
  sha256: 'REPLACE_WITH_REAL_DIGEST',
  bytes: 16_923_827,
  inputName: 'input.1',
  inputSize: 640,
};

export const RECOGNISER: ModelSpec = {
  key: 'w600k_r50',
  url: 'https://REPLACE-ME/w600k_r50.onnx',
  sha256: 'REPLACE_WITH_REAL_DIGEST',
  bytes: 174_383_860,
  inputName: 'input.1',
  inputSize: 112,
};

/** Must match the backend allowlist exactly, or search returns 422. */
export const MODEL_ID = 'insightface/w600k_r50@1';

/** SCRFD preprocessing: (px - 127.5) / 128, RGB, NCHW. */
export const DETECTOR_MEAN = 127.5;
export const DETECTOR_STD = 128.0;

/** ArcFace preprocessing: (px - 127.5) / 127.5 → [-1, 1], RGB, NCHW. */
export const RECOGNISER_MEAN = 127.5;
export const RECOGNISER_STD = 127.5;
```

- [ ] **Step 3: Verify the input names against the actual files**

```bash
python -c "import onnx; m=onnx.load('det_10g.onnx'); print([i.name for i in m.graph.input]); print([o.name for o in m.graph.output])"
```

Expected: one input name, **nine** output names for `det_10g` (3 strides × score/bbox/kps). If you see six, the model has no keypoints and cannot be used — alignment needs the 5 landmarks.

Update `inputName` in the registry to match.

- [ ] **Step 4: Commit**

```bash
git add mobile/packages/face/src/onnx/models.ts
git commit -m "Add ONNX model registry with pinned digests"
```

---

## Task 3: SCRFD output decoding (pure, fully testable)

**Files:**
- Create: `mobile/packages/face/src/onnx/scrfd.ts`
- Test: `mobile/packages/face/src/__tests__/scrfd.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/packages/face/src/__tests__/scrfd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { anchorCenters, distance2bbox, distance2kps, nms, type Box } from '../onnx/scrfd';

describe('anchorCenters', () => {
  it('produces height*width*numAnchors centres scaled by stride', () => {
    const centres = anchorCenters(640, 640, 32, 2);
    expect(centres.length).toBe((640 / 32) * (640 / 32) * 2 * 2);
    expect(centres[0]).toBe(0);
    expect(centres[1]).toBe(0);
    // Two anchors share a position, so the pair repeats before x advances.
    expect(centres[2]).toBe(0);
    expect(centres[3]).toBe(0);
    expect(centres[4]).toBe(32);
    expect(centres[5]).toBe(0);
  });

  it('advances y after a full row', () => {
    const centres = anchorCenters(64, 64, 32, 1);
    expect(centres[0]).toBe(0);
    expect(centres[2]).toBe(32);
    expect(centres[4]).toBe(0);
    expect(centres[5]).toBe(32);
  });
});

describe('distance2bbox', () => {
  it('expands a centre by left/top/right/bottom distances', () => {
    const box = distance2bbox(100, 100, [10, 20, 30, 40]);
    expect(box).toEqual([90, 80, 130, 140]);
  });
});

describe('distance2kps', () => {
  it('offsets the centre by each landmark pair', () => {
    const kps = distance2kps(50, 60, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(kps).toEqual([51, 62, 53, 64, 55, 66, 57, 68, 59, 70]);
  });
});

describe('nms', () => {
  it('drops a heavily overlapping lower-scoring box', () => {
    const boxes: Box[] = [
      { x1: 0, y1: 0, x2: 100, y2: 100, score: 0.9, kps: [] },
      { x1: 5, y1: 5, x2: 105, y2: 105, score: 0.8, kps: [] },
    ];
    expect(nms(boxes, 0.4)).toHaveLength(1);
    expect(nms(boxes, 0.4)[0]?.score).toBe(0.9);
  });

  it('keeps disjoint boxes', () => {
    const boxes: Box[] = [
      { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.9, kps: [] },
      { x1: 100, y1: 100, x2: 110, y2: 110, score: 0.8, kps: [] },
    ];
    expect(nms(boxes, 0.4)).toHaveLength(2);
  });

  it('returns highest score first', () => {
    const boxes: Box[] = [
      { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.2, kps: [] },
      { x1: 50, y1: 50, x2: 60, y2: 60, score: 0.95, kps: [] },
    ];
    expect(nms(boxes, 0.4)[0]?.score).toBe(0.95);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile/packages/face && corepack pnpm exec vitest run scrfd`
Expected: FAIL — `Failed to resolve import "../onnx/scrfd"`.

- [ ] **Step 3: Implement**

Create `mobile/packages/face/src/onnx/scrfd.ts`:

```ts
/**
 * SCRFD output decoding. Pure — no ONNX, no pixels, fully testable.
 *
 * SCRFD emits nine tensors: score/bbox/kps at strides 8, 16 and 32. Each
 * feature-map position carries `numAnchors` (2) predictions, and the bbox and
 * kps values are DISTANCES in stride units, not coordinates. Getting the
 * anchor ordering wrong yields boxes that look plausible and are wrong, which
 * is why the ordering is pinned by test.
 */

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  /** 10 numbers: 5 landmarks as x,y pairs. */
  kps: number[];
}

/**
 * Flat [x0,y0, x1,y1, ...] centres for one stride.
 * Order is x-major within a row, each position repeated `numAnchors` times —
 * this must match the model's own flattening or every box is misplaced.
 */
export function anchorCenters(
  inputHeight: number,
  inputWidth: number,
  stride: number,
  numAnchors: number,
): number[] {
  const rows = Math.floor(inputHeight / stride);
  const cols = Math.floor(inputWidth / stride);
  const out: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      for (let a = 0; a < numAnchors; a += 1) {
        out.push(x * stride, y * stride);
      }
    }
  }
  return out;
}

/** distance = [left, top, right, bottom], already multiplied by stride. */
export function distance2bbox(
  cx: number,
  cy: number,
  distance: readonly number[],
): [number, number, number, number] {
  return [
    cx - (distance[0] ?? 0),
    cy - (distance[1] ?? 0),
    cx + (distance[2] ?? 0),
    cy + (distance[3] ?? 0),
  ];
}

/** distance = 10 values, already multiplied by stride. */
export function distance2kps(cx: number, cy: number, distance: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 10; i += 2) {
    out.push(cx + (distance[i] ?? 0), cy + (distance[i + 1] ?? 0));
  }
  return out;
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

export function nms(boxes: Box[], threshold: number): Box[] {
  const sorted = [...boxes].sort((p, q) => q.score - p.score);
  const kept: Box[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => iou(k, candidate) <= threshold)) kept.push(candidate);
  }
  return kept;
}

export const STRIDES = [8, 16, 32] as const;
export const NUM_ANCHORS = 2;
export const DETECT_THRESHOLD = 0.5;
export const NMS_THRESHOLD = 0.4;

/**
 * Assemble boxes from the nine raw output tensors.
 *
 * `outputs` must be in the session's own output order: three score tensors,
 * then three bbox tensors, then three kps tensors.
 */
export function decodeDetections(
  outputs: readonly Float32Array[],
  inputHeight: number,
  inputWidth: number,
  detScale: number,
  threshold = DETECT_THRESHOLD,
): Box[] {
  const fmc = STRIDES.length;
  const boxes: Box[] = [];

  STRIDES.forEach((stride, idx) => {
    const scores = outputs[idx];
    const bboxPreds = outputs[idx + fmc];
    const kpsPreds = outputs[idx + fmc * 2];
    if (!scores || !bboxPreds || !kpsPreds) return;

    const centres = anchorCenters(inputHeight, inputWidth, stride, NUM_ANCHORS);

    for (let i = 0; i < scores.length; i += 1) {
      const score = scores[i] ?? 0;
      if (score < threshold) continue;

      const cx = centres[i * 2] ?? 0;
      const cy = centres[i * 2 + 1] ?? 0;

      const bbox: number[] = [];
      for (let k = 0; k < 4; k += 1) bbox.push((bboxPreds[i * 4 + k] ?? 0) * stride);

      const kpsDist: number[] = [];
      for (let k = 0; k < 10; k += 1) kpsDist.push((kpsPreds[i * 10 + k] ?? 0) * stride);

      const [x1, y1, x2, y2] = distance2bbox(cx, cy, bbox);
      const kps = distance2kps(cx, cy, kpsDist).map((v) => v / detScale);

      boxes.push({
        x1: x1 / detScale,
        y1: y1 / detScale,
        x2: x2 / detScale,
        y2: y2 / detScale,
        score,
        kps,
      });
    }
  });

  return nms(boxes, NMS_THRESHOLD);
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run scrfd`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/scrfd.ts mobile/packages/face/src/__tests__/scrfd.test.ts
git commit -m "Add SCRFD output decoding with anchor ordering pinned by test"
```

---

## Task 4: Face alignment (pure, fully testable)

The step most often skipped, and the one that most affects accuracy. ArcFace is trained on faces warped to a canonical 5-point template; an unaligned crop costs more accuracy than any threshold tuning recovers.

**Files:**
- Create: `mobile/packages/face/src/onnx/align.ts`
- Test: `mobile/packages/face/src/__tests__/align.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { ARCFACE_TEMPLATE, estimateSimilarityTransform, applyTransform } from '../onnx/align';

describe('estimateSimilarityTransform', () => {
  it('recovers identity when source equals destination', () => {
    const t = estimateSimilarityTransform(ARCFACE_TEMPLATE, ARCFACE_TEMPLATE);
    expect(t.a).toBeCloseTo(1, 5);
    expect(t.b).toBeCloseTo(0, 5);
    expect(t.tx).toBeCloseTo(0, 4);
    expect(t.ty).toBeCloseTo(0, 4);
  });

  it('recovers a pure scale', () => {
    const src = ARCFACE_TEMPLATE.map((v) => v * 2);
    const t = estimateSimilarityTransform(src, ARCFACE_TEMPLATE);
    expect(t.a).toBeCloseTo(0.5, 5);
    expect(t.b).toBeCloseTo(0, 5);
  });

  it('recovers a pure translation', () => {
    const src = ARCFACE_TEMPLATE.map((v, i) => (i % 2 === 0 ? v + 10 : v + 5));
    const t = estimateSimilarityTransform(src, ARCFACE_TEMPLATE);
    expect(t.a).toBeCloseTo(1, 5);
    expect(t.tx).toBeCloseTo(-10, 4);
    expect(t.ty).toBeCloseTo(-5, 4);
  });

  it('recovers a 90 degree rotation', () => {
    // (x,y) -> (-y,x) about the origin
    const src: number[] = [];
    for (let i = 0; i < ARCFACE_TEMPLATE.length; i += 2) {
      src.push(-(ARCFACE_TEMPLATE[i + 1] ?? 0), ARCFACE_TEMPLATE[i] ?? 0);
    }
    const t = estimateSimilarityTransform(src, ARCFACE_TEMPLATE);
    expect(Math.hypot(t.a, t.b)).toBeCloseTo(1, 4);
    const p = applyTransform(t, src[0] ?? 0, src[1] ?? 0);
    expect(p[0]).toBeCloseTo(ARCFACE_TEMPLATE[0] ?? 0, 3);
    expect(p[1]).toBeCloseTo(ARCFACE_TEMPLATE[1] ?? 0, 3);
  });

  it('maps every template point onto itself within a pixel', () => {
    const src = ARCFACE_TEMPLATE.map((v, i) => v * 1.7 + (i % 2 === 0 ? 30 : -12));
    const t = estimateSimilarityTransform(src, ARCFACE_TEMPLATE);
    for (let i = 0; i < 10; i += 2) {
      const p = applyTransform(t, src[i] ?? 0, src[i + 1] ?? 0);
      expect(p[0]).toBeCloseTo(ARCFACE_TEMPLATE[i] ?? 0, 3);
      expect(p[1]).toBeCloseTo(ARCFACE_TEMPLATE[i + 1] ?? 0, 3);
    }
  });
});

describe('ARCFACE_TEMPLATE', () => {
  it('is 5 landmarks inside a 112x112 crop', () => {
    expect(ARCFACE_TEMPLATE).toHaveLength(10);
    for (const v of ARCFACE_TEMPLATE) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(112);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm exec vitest run align`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/packages/face/src/onnx/align.ts`:

```ts
/**
 * 5-point similarity alignment to the ArcFace canonical template.
 *
 * A 2D similarity transform has 4 degrees of freedom:
 *
 *   [x']   [a  -b][x]   [tx]
 *   [y'] = [b   a][y] + [ty]
 *
 * which is a linear least-squares problem with a closed-form solution — no SVD
 * and no matrix library. Using a full affine fit instead would let the crop
 * shear, and ArcFace was never trained on sheared faces.
 */

/** The canonical destination for a 112×112 crop. */
export const ARCFACE_TEMPLATE: readonly number[] = [
  38.2946, 51.6963, // left eye
  73.5318, 51.5014, // right eye
  56.0252, 71.7366, // nose tip
  41.5493, 92.3655, // left mouth corner
  70.7299, 92.2041, // right mouth corner
];

export const CROP_SIZE = 112;

export interface SimilarityTransform {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Least-squares similarity transform mapping `src` onto `dst`. Flat x,y pairs. */
export function estimateSimilarityTransform(
  src: readonly number[],
  dst: readonly number[],
): SimilarityTransform {
  const n = src.length / 2;

  let mx = 0;
  let my = 0;
  let mX = 0;
  let mY = 0;
  for (let i = 0; i < n; i += 1) {
    mx += src[i * 2] ?? 0;
    my += src[i * 2 + 1] ?? 0;
    mX += dst[i * 2] ?? 0;
    mY += dst[i * 2 + 1] ?? 0;
  }
  mx /= n;
  my /= n;
  mX /= n;
  mY /= n;

  let sxX = 0;
  let sxY = 0;
  let sqq = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (src[i * 2] ?? 0) - mx;
    const y = (src[i * 2 + 1] ?? 0) - my;
    const X = (dst[i * 2] ?? 0) - mX;
    const Y = (dst[i * 2 + 1] ?? 0) - mY;
    sxX += x * X + y * Y;
    sxY += x * Y - y * X;
    sqq += x * x + y * y;
  }

  const a = sqq === 0 ? 1 : sxX / sqq;
  const b = sqq === 0 ? 0 : sxY / sqq;

  return { a, b, tx: mX - (a * mx - b * my), ty: mY - (b * mx + a * my) };
}

export function applyTransform(t: SimilarityTransform, x: number, y: number): [number, number] {
  return [t.a * x - t.b * y + t.tx, t.b * x + t.a * y + t.ty];
}

/**
 * Warp an RGBA source into a 112×112 RGBA crop.
 *
 * Inverse mapping with bilinear sampling: for every DESTINATION pixel find its
 * source. Forward mapping would leave holes.
 */
export function warpToCrop(
  rgba: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  t: SimilarityTransform,
  size = CROP_SIZE,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const det = t.a * t.a + t.b * t.b;
  if (det === 0) return out;

  for (let v = 0; v < size; v += 1) {
    for (let u = 0; u < size; u += 1) {
      const dx = u - t.tx;
      const dy = v - t.ty;
      const sx = (t.a * dx + t.b * dy) / det;
      const sy = (-t.b * dx + t.a * dy) / det;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (v * size + u) * 4;

      if (x0 < 0 || y0 < 0 || x0 + 1 >= srcWidth || y0 + 1 >= srcHeight) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 255;
        continue;
      }

      for (let c = 0; c < 3; c += 1) {
        const p00 = rgba[(y0 * srcWidth + x0) * 4 + c] ?? 0;
        const p10 = rgba[(y0 * srcWidth + x0 + 1) * 4 + c] ?? 0;
        const p01 = rgba[((y0 + 1) * srcWidth + x0) * 4 + c] ?? 0;
        const p11 = rgba[((y0 + 1) * srcWidth + x0 + 1) * 4 + c] ?? 0;
        out[o + c] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Yaw and pitch in degrees from the same 5 landmarks. docs/04 §3. */
export function poseFromLandmarks(kps: readonly number[]): { yaw: number; pitch: number } {
  const lx = kps[0] ?? 0;
  const ly = kps[1] ?? 0;
  const rx = kps[2] ?? 0;
  const ry = kps[3] ?? 0;
  const nx = kps[4] ?? 0;
  const ny = kps[5] ?? 0;

  const ex = (lx + rx) / 2;
  const ey = (ly + ry) / 2;
  const interocular = Math.hypot(rx - lx, ry - ly) || 1;

  return {
    yaw: (Math.atan2(nx - ex, interocular) * 180) / Math.PI,
    pitch: (Math.atan2(ny - ey, interocular) * 180) / Math.PI,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run align`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/align.ts mobile/packages/face/src/__tests__/align.test.ts
git commit -m "Add 5-point similarity alignment to the ArcFace template"
```

---

## Task 5: Tensor conversion (pure, fully testable)

**Files:**
- Create: `mobile/packages/face/src/onnx/tensor.ts`
- Test: `mobile/packages/face/src/__tests__/tensor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { l2Normalise, rgbaToNchw } from '../onnx/tensor';

describe('rgbaToNchw', () => {
  it('drops alpha and produces C*H*W floats', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const t = rgbaToNchw(rgba, 2, 1, 127.5, 127.5);
    expect(t).toHaveLength(3 * 1 * 2);
  });

  it('lays out channel-major, not pixel-major', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const t = rgbaToNchw(rgba, 2, 1, 0, 1);
    // R plane, then G plane, then B plane
    expect(Array.from(t)).toEqual([255, 0, 0, 255, 0, 0]);
  });

  it('applies (px - mean) / std', () => {
    const rgba = new Uint8Array([255, 127, 0, 255]);
    const t = rgbaToNchw(rgba, 1, 1, 127.5, 127.5);
    expect(t[0]).toBeCloseTo(1.0, 3);
    expect(t[1]).toBeCloseTo(-0.0039, 3);
    expect(t[2]).toBeCloseTo(-1.0, 3);
  });
});

describe('l2Normalise', () => {
  it('produces a unit vector', () => {
    const v = l2Normalise(new Float32Array([3, 4]));
    expect(Math.hypot(v[0] ?? 0, v[1] ?? 0)).toBeCloseTo(1, 6);
  });

  it('leaves an already-unit vector alone', () => {
    const v = l2Normalise(new Float32Array([1, 0, 0]));
    expect(Array.from(v)).toEqual([1, 0, 0]);
  });

  it('returns the zero vector unchanged rather than dividing by zero', () => {
    const v = l2Normalise(new Float32Array([0, 0, 0]));
    expect(Array.from(v)).toEqual([0, 0, 0]);
  });

  it('lands inside the norm window the server enforces', () => {
    const raw = new Float32Array(512).map(() => Math.random() * 2 - 1);
    const v = l2Normalise(raw);
    let sum = 0;
    for (const x of v) sum += x * x;
    const norm = Math.sqrt(sum);
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm exec vitest run tensor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/packages/face/src/onnx/tensor.ts`:

```ts
/**
 * RGBA pixels → NCHW float tensor, and L2 normalisation.
 *
 * ONNX wants channel-major planes (all R, then all G, then all B). Feeding
 * pixel-major data does not error — it silently produces a garbage embedding,
 * which is why the layout is pinned by test.
 */

export function rgbaToNchw(
  rgba: Uint8Array,
  width: number,
  height: number,
  mean: number,
  std: number,
): Float32Array {
  const plane = width * height;
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i += 1) {
    out[i] = (((rgba[i * 4] ?? 0) - mean) / std);
    out[plane + i] = (((rgba[i * 4 + 1] ?? 0) - mean) / std);
    out[plane * 2 + i] = (((rgba[i * 4 + 2] ?? 0) - mean) / std);
  }
  return out;
}

/**
 * The server rejects ‖v‖ outside [0.99, 1.01] with 422 INVALID_EMBEDDING.
 * More importantly, an un-normalised vector does not error at the maths layer —
 * it silently corrupts cosine ranking.
 */
export function l2Normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = (v[i] ?? 0) / norm;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run tensor`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/tensor.ts mobile/packages/face/src/__tests__/tensor.test.ts
git commit -m "Add NCHW tensor conversion and L2 normalisation"
```

---

## Task 6: Quality signals from pixels (pure, fully testable)

**Files:**
- Create: `mobile/packages/face/src/onnx/signals.ts`
- Test: `mobile/packages/face/src/__tests__/signals.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { laplacianVariance, meanLuma } from '../onnx/signals';

function solid(w: number, h: number, v: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  return px;
}

function checker(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255;
      const o = (y * w + x) * 4;
      px[o] = v;
      px[o + 1] = v;
      px[o + 2] = v;
      px[o + 3] = 255;
    }
  }
  return px;
}

describe('meanLuma', () => {
  it('reports mid grey', () => {
    expect(meanLuma(solid(8, 8, 128), 8, 8)).toBeCloseTo(128, 0);
  });

  it('reports black and white', () => {
    expect(meanLuma(solid(4, 4, 0), 4, 4)).toBeCloseTo(0, 0);
    expect(meanLuma(solid(4, 4, 255), 4, 4)).toBeCloseTo(255, 0);
  });
});

describe('laplacianVariance', () => {
  it('is zero on a flat image', () => {
    expect(laplacianVariance(solid(8, 8, 128), 8, 8)).toBeCloseTo(0, 3);
  });

  it('is large on a high-frequency image', () => {
    expect(laplacianVariance(checker(8, 8), 8, 8)).toBeGreaterThan(1000);
  });

  it('ranks a sharp image above a blurred one', () => {
    const sharp = laplacianVariance(checker(16, 16), 16, 16);
    const blurred = laplacianVariance(solid(16, 16, 128), 16, 16);
    expect(sharp).toBeGreaterThan(blurred);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm exec vitest run signals`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/packages/face/src/onnx/signals.ts`:

```ts
/**
 * Pixel-derived quality signals.
 *
 * The scoring formula and coaching messages already live in `../quality.ts`.
 * This module only MEASURES; it does not decide.
 */

function luma(rgba: Uint8Array, i: number): number {
  return 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
}

export function meanLuma(rgba: Uint8Array, width: number, height: number): number {
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += luma(rgba, i);
  return sum / n;
}

/**
 * Variance of the Laplacian — the standard blur proxy. A blurred face collapses
 * toward the mean of the embedding space and starts scoring plausibly against
 * many people, so this is the highest-value defect-prevention measurement in
 * the pipeline.
 */
export function laplacianVariance(rgba: Uint8Array, width: number, height: number): number {
  const values: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const c = luma(rgba, y * width + x);
      const up = luma(rgba, (y - 1) * width + x);
      const down = luma(rgba, (y + 1) * width + x);
      const left = luma(rgba, y * width + x - 1);
      const right = luma(rgba, y * width + x + 1);
      values.push(up + down + left + right - 4 * c);
    }
  }
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run signals`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/signals.ts mobile/packages/face/src/__tests__/signals.test.ts
git commit -m "Add pixel-derived blur and brightness signals"
```

---

## Task 7: Model download with integrity check

**Files:**
- Create: `mobile/packages/face/src/onnx/download.ts`

Device-only; no vitest.

- [ ] **Step 1: Implement**

Create `mobile/packages/face/src/onnx/download.ts`:

```ts
/**
 * Model acquisition.
 *
 * Models are fetched on first launch, never shipped in the APK — ArcFace alone
 * is 166 MB. The SHA-256 comes from the signed binary and is checked after
 * download: a model file swapped in transit is a supply-chain attack against
 * the recognition system itself.
 */

import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { ModelSpec } from './models';

export interface DownloadProgress {
  key: string;
  receivedBytes: number;
  totalBytes: number;
}

function modelDirectory(): Directory {
  const dir = new Directory(Paths.document, 'perigee-models');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export class ModelIntegrityError extends Error {}

/** Returns the local path, downloading and verifying if not already cached. */
export async function ensureModel(
  spec: ModelSpec,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const target = new File(modelDirectory(), `${spec.key}.onnx`);

  if (target.exists) {
    const cached = await digestOf(target);
    if (cached === spec.sha256.toLowerCase()) return target.uri;
    // A cached file that fails its digest is corrupt or tampered. Delete it.
    target.delete();
  }

  onProgress?.({ key: spec.key, receivedBytes: 0, totalBytes: spec.bytes });

  const response = await fetch(spec.url);
  if (!response.ok) {
    throw new Error(`model download failed: ${spec.key} HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  target.write(bytes);

  const digest = await digestOf(target);
  if (digest !== spec.sha256.toLowerCase()) {
    target.delete();
    throw new ModelIntegrityError(
      `${spec.key} digest mismatch: expected ${spec.sha256}, got ${digest}`,
    );
  }

  onProgress?.({ key: spec.key, receivedBytes: spec.bytes, totalBytes: spec.bytes });
  return target.uri;
}

async function digestOf(file: File): Promise<string> {
  const base64 = file.base64();
  return (
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
      encoding: Crypto.CryptoEncoding.HEX,
    })
  ).toLowerCase();
}
```

> **Note on `digestOf`:** hashing the base64 encoding rather than raw bytes is
> consistent as long as the digest you pin in `models.ts` is computed the same
> way. Compute your pinned digest with:
> `base64 -w0 det_10g.onnx | tr -d '\n' | sha256sum`
> If you prefer to pin the raw-file digest, replace this with a native hashing
> module — do not silently mix the two.

- [ ] **Step 2: Add dependencies**

```bash
cd mobile/apps/field && corepack pnpm add expo-crypto
cd ../.. && corepack pnpm install
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile/packages/face && corepack pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/packages/face/src/onnx/download.ts mobile/apps/field/package.json mobile/pnpm-lock.yaml
git commit -m "Add model download with SHA-256 integrity verification"
```

---

## Task 8: Skia frame decoding

**Files:**
- Create: `mobile/packages/face/src/onnx/decode.ts`

Device-only; no vitest.

- [ ] **Step 1: Implement**

Create `mobile/packages/face/src/onnx/decode.ts`:

```ts
/**
 * Frame decoding via Skia.
 *
 * A JS JPEG decoder plus a JS resize of a 12 MP photo down to 640×640 takes
 * seconds. Skia does both natively in milliseconds. The letterbox matches
 * InsightFace's: scale to fit, pad bottom-right with black, and record the
 * scale so detections can be mapped back to original coordinates.
 */

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

export interface DecodedFrame {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Multiply model-space coordinates by 1/detScale to get original pixels. */
  detScale: number;
}

export async function decodeAndLetterbox(uri: string, target: number): Promise<DecodedFrame> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`could not decode image at ${uri}`);

  const w = image.width();
  const h = image.height();
  const detScale = Math.min(target / w, target / h);
  const newW = Math.round(w * detScale);
  const newH = Math.round(h * detScale);

  const surface = Skia.Surface.MakeOffscreen(target, target);
  if (!surface) throw new Error('could not allocate a Skia surface');

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('black'));
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, w, h),
    Skia.XYWHRect(0, 0, newW, newH),
    Skia.Paint(),
  );
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width: target,
    height: target,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('could not read pixels from the Skia surface');

  return { rgba: new Uint8Array(pixels.buffer), width: target, height: target, detScale };
}

/** Full-resolution RGBA, for warping the aligned crop at native quality. */
export async function decodeFull(uri: string): Promise<DecodedFrame> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`could not decode image at ${uri}`);

  const w = image.width();
  const h = image.height();
  const pixels = image.readPixels(0, 0, {
    width: w,
    height: h,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('could not read pixels');

  return { rgba: new Uint8Array(pixels.buffer), width: w, height: h, detScale: 1 };
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd mobile/packages/face && corepack pnpm exec tsc --noEmit
git add mobile/packages/face/src/onnx/decode.ts
git commit -m "Add Skia frame decoding and letterbox rescale"
```

---

## Task 9: The engine

**Files:**
- Create: `mobile/packages/face/src/onnx/engine.ts`
- Modify: `mobile/packages/face/src/index.ts`

- [ ] **Step 1: Implement the engine**

Create `mobile/packages/face/src/onnx/engine.ts`:

```ts
/**
 * The real on-device pipeline: SCRFD → align → ArcFace → L2 normalise.
 *
 * One InferenceSession per model, created once and held. Session creation
 * costs ~800 ms; doing it per capture makes the app feel broken.
 */

import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import { assessQuality } from '../quality';
import type {
  EmbedResult,
  FaceEngine,
  FaceInput,
  InitResult,
  QualityReport,
  QualitySignals,
} from '../types';
import { ARCFACE_TEMPLATE, CROP_SIZE, estimateSimilarityTransform, poseFromLandmarks, warpToCrop } from './align';
import { decodeAndLetterbox, decodeFull } from './decode';
import { ensureModel } from './download';
import {
  DETECTOR,
  DETECTOR_MEAN,
  DETECTOR_STD,
  MODEL_ID,
  RECOGNISER,
  RECOGNISER_MEAN,
  RECOGNISER_STD,
} from './models';
import { decodeDetections, type Box } from './scrfd';
import { laplacianVariance, meanLuma } from './signals';
import { l2Normalise, rgbaToNchw } from './tensor';

export interface OnnxEngineOptions {
  onProgress?: (key: string, received: number, total: number) => void;
}

/** `uri` is how the app hands over a capture; FaceInput carries frame data. */
export interface OnnxFaceInput extends FaceInput {
  readonly uri?: string;
}

export class OnnxFaceEngine implements FaceEngine {
  readonly modelId = MODEL_ID;
  private detector: InferenceSession | null = null;
  private recogniser: InferenceSession | null = null;
  private chosenProvider = 'cpu';
  private lastSignals: QualitySignals | null = null;

  constructor(private readonly options: OnnxEngineOptions = {}) {}

  get provider(): string {
    return this.chosenProvider;
  }

  async init(): Promise<InitResult> {
    const startedAt = Date.now();

    const detectorPath = await ensureModel(DETECTOR, (p) =>
      this.options.onProgress?.(p.key, p.receivedBytes, p.totalBytes),
    );
    const recogniserPath = await ensureModel(RECOGNISER, (p) =>
      this.options.onProgress?.(p.key, p.receivedBytes, p.totalBytes),
    );

    // Try the accelerated provider, fall back to CPU. On budget Android SoCs
    // NNAPI drivers are frequently slower than a tuned CPU kernel, so this is a
    // runtime probe rather than a build-time assumption (docs/04 §6).
    for (const provider of ['nnapi', 'coreml', 'xnnpack', 'cpu']) {
      try {
        this.detector = await InferenceSession.create(detectorPath, {
          executionProviders: [provider],
        });
        this.recogniser = await InferenceSession.create(recogniserPath, {
          executionProviders: [provider],
        });
        this.chosenProvider = provider;
        break;
      } catch {
        this.detector = null;
        this.recogniser = null;
      }
    }

    if (!this.detector || !this.recogniser) {
      throw new Error('no execution provider could create an InferenceSession');
    }

    return {
      modelId: this.modelId,
      provider: this.chosenProvider,
      initMs: Date.now() - startedAt,
      modelVerified: true,
    };
  }

  async embed(input: OnnxFaceInput): Promise<EmbedResult> {
    if (!this.detector || !this.recogniser) throw new Error('engine not initialised — call init()');
    if (!input.uri) throw new Error('OnnxFaceEngine requires input.uri');

    const startedAt = Date.now();

    const letterboxed = await decodeAndLetterbox(input.uri, DETECTOR.inputSize);
    const detTensor = new Tensor(
      'float32',
      rgbaToNchw(letterboxed.rgba, letterboxed.width, letterboxed.height, DETECTOR_MEAN, DETECTOR_STD),
      [1, 3, DETECTOR.inputSize, DETECTOR.inputSize],
    );

    const detOut = await this.detector.run({ [DETECTOR.inputName]: detTensor });
    const raw = this.detector.outputNames.map((n) => detOut[n]?.data as Float32Array);
    const boxes = decodeDetections(raw, DETECTOR.inputSize, DETECTOR.inputSize, letterboxed.detScale);

    if (boxes.length === 0) throw new Error('NO_FACE_DETECTED');

    const face = boxes.reduce((a, b) => (area(b) > area(a) ? b : a));

    const full = await decodeFull(input.uri);
    const transform = estimateSimilarityTransform(face.kps, ARCFACE_TEMPLATE);
    const crop = warpToCrop(full.rgba, full.width, full.height, transform);

    const pose = poseFromLandmarks(face.kps);
    this.lastSignals = {
      detScore: face.score,
      facePx: Math.round(Math.max(face.x2 - face.x1, face.y2 - face.y1)),
      blur: laplacianVariance(crop, CROP_SIZE, CROP_SIZE),
      yaw: pose.yaw,
      pitch: pose.pitch,
      brightness: meanLuma(crop, CROP_SIZE, CROP_SIZE),
      faceCount: boxes.length,
    };

    const recTensor = new Tensor(
      'float32',
      rgbaToNchw(crop, CROP_SIZE, CROP_SIZE, RECOGNISER_MEAN, RECOGNISER_STD),
      [1, 3, CROP_SIZE, CROP_SIZE],
    );
    const recOut = await this.recogniser.run({ [RECOGNISER.inputName]: recTensor });
    const embeddingName = this.recogniser.outputNames[0];
    if (!embeddingName) throw new Error('recogniser produced no output');

    const embedding = l2Normalise(recOut[embeddingName]?.data as Float32Array);

    return {
      embedding,
      modelId: this.modelId,
      quality: assessQuality(this.lastSignals),
      latencyMs: Date.now() - startedAt,
    };
  }

  assessQuality(input: FaceInput): QualityReport {
    const signals = input.signals ?? this.lastSignals;
    if (!signals) throw new Error('no signals available — call embed() first');
    return assessQuality(signals);
  }

  async selfTest() {
    const { runSelfTest } = await import('./selftest');
    return runSelfTest(this);
  }
}

function area(b: Box): number {
  return (b.x2 - b.x1) * (b.y2 - b.y1);
}
```

- [ ] **Step 2: Export it**

Modify `mobile/packages/face/src/index.ts` — add to the existing exports:

```ts
export * from './onnx/engine';
export * from './onnx/models';
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile/packages/face && corepack pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify the fixture tests still pass**

Run: `corepack pnpm exec vitest run`
Expected: all previous tests still PASS. The ONNX modules are not imported by them.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/engine.ts mobile/packages/face/src/index.ts
git commit -m "Add OnnxFaceEngine implementing the FaceEngine interface"
```

---

## Task 10: The self-test harness ⚠️ THE GO/NO-GO GATE

**Files:**
- Create: `mobile/packages/face/src/onnx/selftest.ts`
- Create: `mobile/packages/face/assets/selftest/` — 20 bundled synthetic face images

- [ ] **Step 1: Prepare the fixture images**

Generate 20 **synthetic** faces (StyleGAN3 output or a licensed synthetic corpus — never a real person): 10 pairs where each pair is two images of the same synthetic identity, and arrange them so cross-pair comparisons are different identities. Place as `assets/selftest/id{N}_a.jpg` and `id{N}_b.jpg` for N = 1..10.

- [ ] **Step 2: Implement**

Create `mobile/packages/face/src/onnx/selftest.ts`:

```ts
/**
 * The go/no-go gate from docs/04 §6.
 *
 * This is the test that decides whether the on-device architecture holds. Run
 * it on the ACTUAL demo handset, not an emulator: emulator CPU bears no
 * relation to a mid-range Android SoC.
 */

import type { FaceEngine, SelfTestReport } from '../types';
import { cosine } from './tensor';

export const SAME_IDENTITY_FLOOR = 0.55;
export const CROSS_IDENTITY_CEILING = 0.3;
export const P95_LATENCY_BUDGET_MS = 400;

export interface SelfTestPair {
  a: string;
  b: string;
  sameIdentity: boolean;
}

export async function runSelfTest(
  engine: FaceEngine,
  pairs: SelfTestPair[] = [],
): Promise<SelfTestReport> {
  const failures: string[] = [];
  const latencies: number[] = [];
  let sameMin = 1;
  let crossMax = 0;

  for (const pair of pairs) {
    const ea = await (engine as FaceEngine & { embed: (i: { uri: string }) => Promise<{ embedding: Float32Array; latencyMs: number }> }).embed({ uri: pair.a });
    const eb = await (engine as FaceEngine & { embed: (i: { uri: string }) => Promise<{ embedding: Float32Array; latencyMs: number }> }).embed({ uri: pair.b });
    latencies.push(ea.latencyMs, eb.latencyMs);

    const score = cosine(ea.embedding, eb.embedding);
    if (pair.sameIdentity) sameMin = Math.min(sameMin, score);
    else crossMax = Math.max(crossMax, score);
  }

  if (pairs.length === 0) failures.push('no pairs supplied');
  if (pairs.length > 0 && sameMin <= SAME_IDENTITY_FLOOR) {
    failures.push(`same-identity minimum ${sameMin.toFixed(3)} <= ${SAME_IDENTITY_FLOOR}`);
  }
  if (pairs.length > 0 && crossMax >= CROSS_IDENTITY_CEILING) {
    failures.push(`cross-identity maximum ${crossMax.toFixed(3)} >= ${CROSS_IDENTITY_CEILING}`);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  if (p95 > P95_LATENCY_BUDGET_MS) {
    failures.push(`p95 latency ${p95} ms exceeds ${P95_LATENCY_BUDGET_MS} ms`);
  }

  return {
    passed: failures.length === 0,
    modelId: engine.modelId,
    provider: engine.provider,
    pairsTested: pairs.length,
    sameIdentityMin: sameMin,
    crossIdentityMax: crossMax,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    failures,
  };
}
```

- [ ] **Step 3: Surface it in the diagnostics screen**

Extend `mobile/apps/field/app/diagnostics.tsx` with a button that constructs an `OnnxFaceEngine`, calls `init()`, then `selfTest()` with the bundled pairs, and renders the full `SelfTestReport`.

- [ ] **Step 4: RUN IT ON THE DEMO DEVICE AND RECORD THE OUTPUT**

```bash
cd mobile/apps/field && corepack pnpm exec expo run:android --device
```

Record `provider`, `p50LatencyMs`, `p95LatencyMs`, `sameIdentityMin`, `crossIdentityMax`, `passed`.

**This output is the deliverable of the entire plan.** Paste it into the PR.

- [ ] **Step 5: Commit**

```bash
git add mobile/packages/face/src/onnx/selftest.ts mobile/packages/face/assets mobile/apps/field/app/diagnostics.tsx
git commit -m "Add on-device self-test harness"
```

---

## Task 11: Wire the engine into the app behind a flag

**Files:**
- Modify: `mobile/apps/field/lib/perigee.ts`

- [ ] **Step 1: Make the engine selectable**

Replace `getFaceEngine()` in `mobile/apps/field/lib/perigee.ts`:

```ts
import { createFixtureEngine, OnnxFaceEngine, type FaceEngine } from '@perigee/face';

let engine: FaceEngine | null = null;

/**
 * The fixture engine remains the DEFAULT. Real inference is opt-in until the
 * self-test has passed on the target device fleet — shipping an unvalidated
 * recognition path is exactly the failure this project is built to avoid.
 */
export function getFaceEngine(): FaceEngine {
  if (engine) return engine;
  const useOnnx = envValue('EXPO_PUBLIC_USE_ONNX', 'false') === 'true';
  engine = useOnnx ? new OnnxFaceEngine() : createFixtureEngine();
  return engine;
}
```

- [ ] **Step 2: Typecheck the app**

Run: `cd mobile/apps/field && corepack pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Full workspace verification**

```bash
cd mobile
corepack pnpm -r typecheck
corepack pnpm -r test
```

Expected: 6/6 typechecks pass; all tests pass with ~18 new ones.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/field/lib/perigee.ts
git commit -m "Make the ONNX engine opt-in behind EXPO_PUBLIC_USE_ONNX"
```

---

## Definition of done

```
☐ Task 1 passed on a REAL device (not emulator, not Expo Go)
☐ ~18 new unit tests pass in vitest with no device
☐ pnpm -r typecheck: 6/6 clean
☐ Model digests verified; a corrupted file is rejected
☐ selfTest() run on the demo handset, output recorded in the PR
☐ Fixture engine still the default; ONNX opt-in via env
☐ No change to src/types.ts
```

**If the self-test fails**, do not tune thresholds to make it pass. Report the numbers and switch to `ENABLE_SERVER_EMBED=true` on a larger host — the API contract already supports it.

---

## Traps

| Trap | Symptom | Avoidance |
| --- | --- | --- |
| Expo Go | `Cannot find native module` | Build a custom dev client |
| Expo SDK upgrade | Module stops loading | `onnxruntime-react-native` has no `codegenConfig`; RN 0.82 removes the Bridge. Stay on SDK 54. |
| Pixel-major tensor | Garbage embeddings, no error | `rgbaToNchw` is channel-major; test pins it |
| Missing L2 normalise | `422 INVALID_EMBEDDING` | `l2Normalise` before returning |
| Affine instead of similarity | Accuracy quietly drops | 4-DOF closed form only; no shear |
| Wrong anchor order | Plausible boxes in wrong places | `anchorCenters` ordering is test-pinned |
| Session per capture | ~800 ms added per search | Create once in `init()` |
| Emulator benchmarking | Meaningless latency | Real handset only |

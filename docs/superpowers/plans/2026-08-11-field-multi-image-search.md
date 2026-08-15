# Field Multi-Image Face Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Perigee Field acquire three synthetic probe images, produce one robust ArcFace query vector on-device, search pgvector, and preserve the existing human decision boundary.

**Architecture:** A volatile three-slot screening session replaces the single media/fixture path. Every accepted probe is embedded with the shared ONNX engine; a robust aggregate is the only biometric value sent to `/v1/search`. Source pixels and individual embeddings are erased from application state when the screening is reset or resolved.

**Tech Stack:** Expo Router, React Native, Zustand 5, `@perigee/camera`, `@perigee/face`, `@perigee/api-client`, Vitest 3.

---

## Task 1: Model a three-probe screening session

**Files:**
- Modify: `mobile/apps/field/src/domain/screening.ts`
- Modify: `mobile/apps/field/src/domain/screening.test.ts`
- Modify: `mobile/apps/field/src/state/fieldStore.ts`
- Create: `mobile/apps/field/src/state/fieldStore.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Define slots `probe-1`, `probe-2`, `probe-3` and phases `idle`, `capturing`, `reviewing`, `processing`, `ready-to-search`, `searching`, `pending-decision`, and `resolved`. Test capture, retake, quality rejection, aggregation success, search failure retry, decision, reset, and illegal phase transitions.

Tests must prove `resetScreening()` clears all media URIs, per-probe embeddings, aggregate embedding, search response, and decision while retaining the signed-in shift and connection configuration.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/field test -- screening.test.ts fieldStore.test.ts`

Expected: FAIL against the existing one-image fixture state.

- [ ] **Step 3: Implement volatile probe state**

Each accepted probe stores media metadata, quality report, model ID, and a 512-number vector. Keep this state out of persistent storage. Remove `fixtureName` and `fixtureBundle` from the normal screening state; diagnostic fixtures remain isolated in the diagnostics screen.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/field test`

Run: `pnpm --dir mobile --filter @perigee/field typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/field/src/domain mobile/apps/field/src/state
git commit -m "feat(field): model three-image screenings"
```

---

## Task 2: Capture, process, and coach three probes

**Files:**
- Modify: `mobile/apps/field/app/scan/capture.tsx`
- Modify: `mobile/apps/field/app/scan/review.tsx`
- Create: `mobile/apps/field/src/services/processProbe.ts`
- Create: `mobile/apps/field/src/services/processProbe.test.ts`
- Create: `mobile/apps/field/src/components/ProbeProgress.tsx`

- [ ] **Step 1: Write failing processing tests**

Tests inject a fake real-engine interface and assert URI embedding, single-face enforcement, quality thresholds, slot replacement, and readable messages for no face, multiple faces, blur, insufficient face size, poor lighting, and excessive pose. Ensure an error never advances the slot.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/field test -- processProbe.test.ts`

Expected: FAIL because `processProbe.ts` does not exist.

- [ ] **Step 3: Implement the three-capture loop**

The screen captures/imports one original-quality image at a time, processes it immediately, displays quality feedback, and advances only after acceptance. Require slight pose/lighting variation across the three prompts but keep the full face visible. Review shows thumbnails and metrics, permits any retake, and states that the next step sends one vector rather than images.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/field test`

Run: `pnpm --dir mobile --filter @perigee/field typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/field
git commit -m "feat(field): capture and validate three face probes"
```

---

## Task 3: Aggregate probes and submit one real vector search

**Files:**
- Create: `mobile/apps/field/src/services/prepareSearch.ts`
- Create: `mobile/apps/field/src/services/prepareSearch.test.ts`
- Modify: `mobile/apps/field/app/scan/searching.tsx`
- Modify: `mobile/apps/field/app/scan/fixture.tsx`
- Modify: `mobile/apps/field/src/navigation/routes.ts`
- Modify: `mobile/apps/field/src/navigation/routes.test.ts`

- [ ] **Step 1: Write failing search-preparation tests**

Test model-ID agreement, three finite 512-dimensional unit vectors, medoid/outlier processing, minimum retained count of two, quality-weighted centroid normalization, and conversion from `Float32Array` to JSON numbers. Assert exactly one `client.search` call containing the aggregate, `insightface/w600k_r50@1`, aggregate quality, and the shift reason code.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/field test -- prepareSearch.test.ts`

Expected: FAIL because preparation still reads a fixture vector.

- [ ] **Step 3: Replace the normal fixture route**

After review, navigate directly to searching. Move fixture selection behind Settings > Diagnostics and label every such result “connectivity fixture, not recognition.” Searching uses only the aggregate result and preserves the server contract: ranked candidates are suggestions for human review, never an automatic assertion.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/field test`

Run: `pnpm --dir mobile check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/field
git commit -m "feat(field): search with aggregated ArcFace probes"
```

---

## Task 4: Enforce cleanup after the human decision loop

**Files:**
- Modify: `mobile/apps/field/app/results/[searchId].tsx`
- Modify: `mobile/apps/field/src/domain/screening.ts`
- Modify: `mobile/apps/field/src/domain/screening.test.ts`
- Modify: `mobile/apps/field/src/state/fieldStore.ts`
- Modify: `mobile/apps/field/src/state/fieldStore.test.ts`

- [ ] **Step 1: Write failing cleanup tests**

Assert that a successful `CONFIRMED`, `NO_MATCH`, `INCONCLUSIVE`, or `ABORTED` decision clears probe pixels/URIs and individual/aggregate embeddings only after the write-once server decision succeeds. A failed decision retains the screening for retry. Explicit cancel/reset clears immediately after user confirmation.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/field test -- screening.test.ts fieldStore.test.ts`

Expected: FAIL until cleanup is connected.

- [ ] **Step 3: Implement cleanup and user copy**

Keep only non-biometric activity metadata: search ID, decision, candidate count, latency, and timestamp. Add no background search, no continuous capture, and no automatic candidate selection.

- [ ] **Step 4: Run all Field and workspace checks**

Run: `pnpm --dir mobile --filter @perigee/field test`

Run: `pnpm --dir mobile check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/field
git commit -m "feat(field): clear biometric screening state"
```

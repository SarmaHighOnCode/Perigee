# Enroll Multi-Image Face Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Perigee Enroll acquire, validate, embed, upload, and persist six synthetic face images per enrolled identity, each tied to its committed media record.

**Architecture:** Draft schema v2 treats every capture slot as an independent resumable unit. Quality and embedding are calculated locally before review; submission preserves the existing person/media checkpoints and adds embedding/case/relationship checkpoints. Every backend write is recoverable or explicitly marked as requiring reconciliation.

**Tech Stack:** Expo Router, React Native, Zustand 5, `@perigee/camera`, `@perigee/face`, `@perigee/api-client`, Vitest 3.

---

## Task 1: Add the missing typed records endpoints to the API client

**Files:**
- Modify: `mobile/packages/api-client/src/types.ts`
- Modify: `mobile/packages/api-client/src/client.ts`
- Modify: `mobile/packages/api-client/src/index.ts`
- Test: `mobile/packages/api-client/src/enroll.test.ts`

- [ ] **Step 1: Write failing request-contract tests**

Cover `GET /v1/cases`, `POST /v1/person/{personId}/cases`, and `POST /v1/person/{personId}/relationships`. Assert exact request bodies from `backend/app/models/records.py`, device/officer headers, encoded IDs, and response types. POSTs are single-attempt because automatic retries could make an ambiguous write.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/api-client test -- enroll.test.ts`

Expected: FAIL because the three client methods do not exist.

- [ ] **Step 3: Implement the exact backend contracts**

Add `listCases(query?)`, `linkCase(personId, { case_id, role })`, and `createRelationship(personId, { target_person_id, edge_type, evidence_case_ids, weight? })`. Use the server's snake-case response fields without remapping.

- [ ] **Step 4: Run client tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/api-client test && pnpm --dir mobile --filter @perigee/api-client typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/packages/api-client
git commit -m "feat(api-client): support enrollment record writes"
```

---

## Task 2: Migrate enrollment drafts to six capture slots

**Files:**
- Modify: `mobile/apps/enroll/src/domain/draft.ts`
- Modify: `mobile/apps/enroll/src/domain/draft.test.ts`
- Modify: `mobile/apps/enroll/src/domain/validation.ts`
- Modify: `mobile/apps/enroll/src/domain/validation.test.ts`
- Modify: `mobile/apps/enroll/src/state/draftSelectors.ts`
- Modify: `mobile/apps/enroll/src/state/draftSelectors.test.ts`

- [ ] **Step 1: Write failing schema-v2 tests**

Define slots in this exact order:

```ts
export const requiredCaptureSlots = [
  'frontal-1', 'frontal-2', 'left-1', 'left-2', 'right-1', 'right-2',
] as const;
```

Test new drafts, readiness with five versus six captures, retake invalidation, checkpoint persistence, and v1 migration. V1 `frontal`, `left`, and `right` become the corresponding `-1` slots; the migrated draft remains incomplete until the three `-2` images are captured. Never duplicate one legacy photo into two slots.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/enroll test -- draft.test.ts validation.test.ts draftSelectors.test.ts`

Expected: FAIL on schema version and slot expectations.

- [ ] **Step 3: Implement schema v2 and checkpoint types**

Each capture stores its slot, angle, URI metadata, optional `quality`, and optional embedding checkpoint. Submission media and embedding maps use `RequiredCaptureSlot`. Embedding checkpoint states are `idle | generating | ready | committed | failed`, and a ready checkpoint holds a JSON-serializable 512-number vector, model ID, and quality report. Increment `DRAFT_SCHEMA_VERSION` to 2.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/enroll test`

Run: `pnpm --dir mobile --filter @perigee/enroll typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/enroll/src/domain mobile/apps/enroll/src/state
git commit -m "feat(enroll): migrate drafts to six face captures"
```

---

## Task 3: Capture and quality-check two images per pose

**Files:**
- Modify: `mobile/apps/enroll/src/components/CaptureStep.tsx`
- Create: `mobile/apps/enroll/src/components/CaptureSlotCard.tsx`
- Create: `mobile/apps/enroll/src/services/embedCapture.ts`
- Create: `mobile/apps/enroll/src/services/embedCapture.test.ts`
- Modify: `mobile/apps/enroll/app/enroll/capture-front.tsx`
- Modify: `mobile/apps/enroll/app/enroll/capture-left.tsx`
- Modify: `mobile/apps/enroll/app/enroll/capture-right.tsx`

- [ ] **Step 1: Write failing capture-service tests**

The service calls the real engine with the media URI, rejects non-single-face images, returns actionable messages for blur/lighting/pose/face-size failure, and stores the quality report plus embedding only after all thresholds pass. Retaking a slot removes its old embedding and submission checkpoints.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/enroll test -- embedCapture.test.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement the six-slot capture UI**

Each pose page presents two numbered cards, a camera/gallery action for the active slot, live processing status, quality measurements, and retake. Continue is disabled until both slots for that page have accepted embeddings. Update copy to state that image processing and embeddings stay on-device until explicit submission.

- [ ] **Step 4: Run app tests and typecheck**

Run: `pnpm --dir mobile --filter @perigee/enroll test`

Run: `pnpm --dir mobile --filter @perigee/enroll typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/enroll
git commit -m "feat(enroll): capture and validate six face images"
```

---

## Task 4: Detect accidental cross-identity enrollment

**Files:**
- Create: `mobile/apps/enroll/src/domain/faceConsistency.ts`
- Create: `mobile/apps/enroll/src/domain/faceConsistency.test.ts`
- Modify: `mobile/apps/enroll/app/enroll/review.tsx`

- [ ] **Step 1: Write failing consistency tests**

Use the aggregation module to compute a medoid, reject outliers, and require all six captures to have adequate similarity to the retained identity cluster. Test a coherent six-image set, one foreign identity, duplicate-zero vectors, and an ambiguous 3-vs-3 split. The ambiguous cases block submission and list the slots to retake.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/enroll test -- faceConsistency.test.ts`

Expected: FAIL because `faceConsistency.ts` is absent.

- [ ] **Step 3: Implement review evidence**

Show every capture's pose, quality, model ID, and consistency status. Never display “identity confirmed”; use “capture set is internally consistent” and retain operator review responsibility.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --dir mobile --filter @perigee/enroll test && pnpm --dir mobile --filter @perigee/enroll typecheck`

```powershell
git add mobile/apps/enroll
git commit -m "feat(enroll): gate enrollment on face consistency"
```

---

## Task 5: Persist every media-bound embedding and record link

**Files:**
- Modify: `mobile/apps/enroll/src/services/submitEnrollment.ts`
- Modify: `mobile/apps/enroll/src/services/submitEnrollment.test.ts`
- Modify: `mobile/apps/enroll/app/enroll/receipt.tsx`
- Modify: `mobile/apps/enroll/app/settings/about.tsx`

- [ ] **Step 1: Extend failing submission tests**

For six slots assert: create person once; presign/upload/commit each media; call `addEmbedding` only after its media commit with `{ embedding, model_id, quality_score, det_score, yaw, pitch, media_id }`; preserve committed checkpoints on retry; link cases; then create relationships. Add failures at every boundary and verify the result is `blocked` or `needs_recovery`, never falsely `complete`.

The database uniqueness key is `(person_id, model_id, media_id)`, so a repeat after an uncertain embedding POST requires server reconciliation rather than blind retry.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --dir mobile --filter @perigee/enroll test -- submitEnrollment.test.ts`

Expected: FAIL because embeddings and record writes are not submitted.

- [ ] **Step 3: Implement the ordered state machine**

The only successful order per slot is prepare image, presign, upload, commit media, then add embedding with that media ID. Mark the whole workflow complete only after all six embedding checkpoints and all optional record checkpoints are committed. The receipt lists person ID, six media IDs, six embedding IDs, cases, relationships, and recoverable failures.

- [ ] **Step 4: Run all Enroll and workspace checks**

Run: `pnpm --dir mobile --filter @perigee/enroll test`

Run: `pnpm --dir mobile check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add mobile/apps/enroll
git commit -m "feat(enroll): submit media-bound face embeddings"
```

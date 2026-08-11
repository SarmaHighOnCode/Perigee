# Perigee Enroll and Mobile Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second Expo target for records-desk enrolment, connect supported backend operations, and verify both local Android release applications.

**Architecture:** Perigee Enroll consumes the same API, camera, token and UI packages as Field. A pure versioned draft reducer drives the seven-step wizard; transport operations are explicit commands so interrupted media uploads do not corrupt the local draft.

**Tech Stack:** Expo SDK 54, Expo Router, VisionCamera 5, Reanimated, SecureStore, persistent Zustand state, TanStack Query, TypeScript, Vitest, Android Gradle/R8

---

### Task 1: Enrolment draft domain

**Files:**
- Create: `mobile/apps/enroll/src/domain/draft.ts`
- Create: `mobile/apps/enroll/src/domain/validation.ts`
- Test: `mobile/apps/enroll/src/domain/draft.test.ts`
- Test: `mobile/apps/enroll/src/domain/validation.test.ts`

- [ ] **Step 1: Write failing state tests**

Cover draft creation, schema version, identity validation, front/left/right capture replacement, case role separation, evidence-required relationships, review readiness, and safe migration from an older draft.

```ts
expect(canSubmitRelationship({ evidenceCaseIds: [] })).toBe(false);
expect(requiredAnglesComplete(draft.captures)).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --dir mobile --filter @perigee/enroll test`  
Expected: missing domain modules.

- [ ] **Step 3: Implement minimal immutable transitions**

Use `DRAFT_SCHEMA_VERSION = 1`. Store media URIs and metadata, never image bytes. Keep processing status distinct for person creation, presign, upload, commit, and deferred embedding.

- [ ] **Step 4: Run GREEN**

Run Enroll domain tests. Expected: pass.

### Task 2: Enrolment API commands

**Files:**
- Modify: `mobile/packages/api-client/src/types.ts`
- Modify: `mobile/packages/api-client/src/client.ts`
- Test: `mobile/packages/api-client/src/enroll.test.ts`

- [ ] **Step 1: Write failing command tests**

Cover `createPerson`, `createEmbedding`, `presignMedia`, direct upload with required headers, `commitMedia`, and structured `503 OBJECT_STORAGE_UNAVAILABLE` behavior.

- [ ] **Step 2: Run RED**

Run API client tests. Expected: missing commands.

- [ ] **Step 3: Implement exact PR request/response shapes**

The direct upload receives file bytes separately from JSON API calls. Commit includes SHA-256, byte size, dimensions, and `exif_stripped: true` only after the media transformer confirms it.

- [ ] **Step 4: Run GREEN**

Run API tests and type checks. Expected: pass.

### Task 3: Enroll routes and wizard

**Files:**
- Create: `mobile/apps/enroll/package.json`
- Create: `mobile/apps/enroll/app.json`
- Create: `mobile/apps/enroll/index.js`
- Create: `mobile/apps/enroll/app/_layout.tsx`
- Create: `mobile/apps/enroll/app/operator.tsx`
- Create: `mobile/apps/enroll/app/(tabs)/_layout.tsx`
- Create: `mobile/apps/enroll/app/(tabs)/roster.tsx`
- Create: `mobile/apps/enroll/app/(tabs)/drafts.tsx`
- Create: `mobile/apps/enroll/app/(tabs)/activity.tsx`
- Create: `mobile/apps/enroll/app/(tabs)/more.tsx`
- Create: `mobile/apps/enroll/app/enroll/identity.tsx`
- Create: `mobile/apps/enroll/app/enroll/capture-front.tsx`
- Create: `mobile/apps/enroll/app/enroll/capture-left.tsx`
- Create: `mobile/apps/enroll/app/enroll/capture-right.tsx`
- Create: `mobile/apps/enroll/app/enroll/cases.tsx`
- Create: `mobile/apps/enroll/app/enroll/relationships.tsx`
- Create: `mobile/apps/enroll/app/enroll/review.tsx`
- Create: `mobile/apps/enroll/app/enroll/receipt.tsx`
- Create: `mobile/apps/enroll/app/person/[id].tsx`
- Create: `mobile/apps/enroll/app/settings/uploads.tsx`
- Create: `mobile/apps/enroll/app/settings/diagnostics.tsx`
- Create: `mobile/apps/enroll/app/settings/about.tsx`

- [ ] **Step 1: Add failing route and wizard tests**

Assert the route inventory, step order, persistent draft ID, three required captures, source-contact URL, and absence of name-search claims.

- [ ] **Step 2: Run RED**

Run Enroll tests. Expected: route/wizard failures.

- [ ] **Step 3: Implement the route shell and screens**

Roster lists only local drafts, locally created IDs and explicit record-ID lookup. Each wizard screen presents one primary action and adjacent validation. Capture screens reuse `@perigee/camera` and label pose/biometric quality as deferred.

- [ ] **Step 4: Run GREEN and type check**

Run: `pnpm --dir mobile --filter @perigee/enroll test && pnpm --dir mobile --filter @perigee/enroll typecheck`  
Expected: pass.

### Task 4: Submit and retry orchestration

**Files:**
- Create: `mobile/apps/enroll/src/services/submitEnrollment.ts`
- Create: `mobile/apps/enroll/src/services/uploadMedia.ts`
- Test: `mobile/apps/enroll/src/services/submitEnrollment.test.ts`
- Test: `mobile/apps/enroll/src/services/uploadMedia.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Cover person creation once, resumable angle uploads, commit only after successful PUT, object-storage unavailable state, idempotent resume, and no completion receipt when required work fails.

- [ ] **Step 2: Run RED**

Run Enroll tests. Expected: service modules missing.

- [ ] **Step 3: Implement explicit operation checkpoints**

Persist returned person/media IDs after each completed operation. Do not retry non-idempotent person creation automatically after an unknown network outcome; present recovery state instead.

- [ ] **Step 4: Run GREEN**

Run Enroll tests. Expected: pass.

### Task 5: Android target and local release build

**Files:**
- Create: `mobile/apps/enroll/plugins/withAndroidReleaseOptimizations.js`
- Create: generated `mobile/apps/enroll/android/`

- [ ] **Step 1: Test the release plugin**

Assert the same R8, resource shrinking, compression and ABI split settings as Field.

- [ ] **Step 2: Generate and build locally**

Run: `pnpm --dir mobile --filter @perigee/enroll exec expo prebuild --platform android --clean`  
Run: `mobile\apps\enroll\android\gradlew.bat -p mobile\apps\enroll\android app:assembleRelease`  
Expected: separate x86_64 and arm64-v8a APKs for `com.perigee.enroll`.

### Task 6: Cross-application verification

**Files:**
- Create: `mobile/docs/verification-report.md`
- Modify: `.github/workflows/mobile-ci.yml` after PR #2 is merged or by an isolated follow-up change

- [ ] **Step 1: Run complete automated checks**

Run from `mobile/`: `pnpm test`, `pnpm typecheck`, and both release builds. Record exact totals and artifact paths.

- [ ] **Step 2: Install both Pixel 7 emulator APKs**

Use the SDK-local ADB executable. Verify two launchable package IDs, no Metro connection, route navigation, permissions, gallery picker, synthetic labels, result guard, drafts, and GitHub actions.

- [ ] **Step 3: Measure artifacts**

Record universal and ABI APK sizes where produced. Inspect each release APK for `assets/index.android.bundle`, native architectures and the absence of unintended audio permissions.

- [ ] **Step 4: Audit every design acceptance criterion**

Map each criterion in `docs/superpowers/specs/2026-08-11-perigee-mobile-apps-design.md` to a test output, APK inspection, emulator observation, or an explicit remaining physical-device step. Do not infer optical camera quality from the emulator.

- [ ] **Step 5: Update CI paths**

When the backend PR workflow is present in the working tree, change mobile CI to install at `mobile/` and run workspace tests/type checks. Preserve Camera Lab as a separate regression job.

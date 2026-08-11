# Perigee Mobile Foundation and Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the shared Expo workspace and a locally buildable Perigee Field app that completes the synthetic search and mandatory-decision workflow with the proven camera implementation.

**Architecture:** A pnpm workspace under `mobile/` owns one Expo Router application and focused shared packages. Domain behavior and the HTTP client remain platform-independent and testable; native capture is adapted from Camera Lab behind a small interface.

**Tech Stack:** Expo SDK 54, React Native 0.81, Expo Router, VisionCamera 5, Reanimated, TanStack Query, Zustand, TypeScript strict, Vitest, Gradle 8.14/JDK 17

---

### Task 1: Workspace and contract types

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/pnpm-workspace.yaml`
- Create: `mobile/tsconfig.base.json`
- Create: `mobile/packages/api-client/package.json`
- Create: `mobile/packages/api-client/src/types.ts`
- Create: `mobile/packages/api-client/src/index.ts`
- Test: `mobile/packages/api-client/src/types.test.ts`

- [ ] **Step 1: Write the failing contract test**

Assert that `isCandidateResponse` accepts the PR response shape and rejects an object containing a machine-authored `is_match` field.

```ts
expect(isCandidateResponse(validResponse)).toBe(true);
expect(isCandidateResponse({ ...validResponse, is_match: true })).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --dir mobile --filter @perigee/api-client test`  
Expected: failure because the package and parser do not exist.

- [ ] **Step 3: Add strict shared types and parser**

Define `DatasetMode`, `Band`, `ReasonCode`, `Decision`, `SearchRequest`, `SearchResponse`, `Candidate`, `PendingResponse`, `PersonDetail`, `GraphResponse`, `PersonCreate`, `MediaPresigned`, `MediaCommitted`, and `ApiErrorEnvelope`. The response parser rejects unknown matching assertions.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --dir mobile --filter @perigee/api-client test`  
Expected: contract tests pass.

### Task 2: HTTP client and recoverable errors

**Files:**
- Create: `mobile/packages/api-client/src/client.ts`
- Create: `mobile/packages/api-client/src/errors.ts`
- Test: `mobile/packages/api-client/src/client.test.ts`

- [ ] **Step 1: Write failing request tests**

Cover header injection, JSON parsing, request IDs, timeout, structured `429`, `403`, `409`, `422`, `503`, and invalid response handling with an injected `fetch` function.

```ts
const client = createPerigeeClient({ baseUrl, deviceKey, officerId, fetch: fakeFetch });
await client.search(request);
expect(observedHeaders['X-Perigee-Device-Key']).toBe(deviceKey);
expect(observedHeaders['X-Perigee-Officer-Id']).toBe(officerId);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --dir mobile --filter @perigee/api-client test`  
Expected: missing `createPerigeeClient`.

- [ ] **Step 3: Implement the minimal client**

Expose `health`, `ready`, `config`, `search`, `searchDetail`, `pending`, `decide`, `person`, and `graph`. Normalize base URLs and throw `PerigeeApiError` with `status`, `code`, `detail`, and `requestId`.

- [ ] **Step 4: Run GREEN**

Run the package tests and type check. Expected: pass with no TypeScript errors.

### Task 3: Tokens and UI primitives

**Files:**
- Create: `mobile/packages/design-tokens/src/index.ts`
- Create: `mobile/packages/ui/src/Brut.tsx`
- Create: `mobile/packages/ui/src/Button.tsx`
- Create: `mobile/packages/ui/src/Card.tsx`
- Create: `mobile/packages/ui/src/StatusChip.tsx`
- Create: `mobile/packages/ui/src/Screen.tsx`
- Create: `mobile/packages/ui/src/SyntheticBanner.tsx`
- Create: `mobile/packages/ui/src/index.ts`
- Test: `mobile/packages/design-tokens/src/index.test.ts`
- Test: `mobile/packages/ui/src/semantics.test.ts`

- [ ] **Step 1: Write failing semantic-token tests**

Assert the exact documented palette, 3 dp border, 5 dp shadow, square radius, minimum touch targets, and that every status tone maps to a text label.

- [ ] **Step 2: Run RED**

Run: `pnpm --dir mobile --filter @perigee/design-tokens test`  
Expected: package missing.

- [ ] **Step 3: Implement tokens and primitives**

Use hard offset shadows only. `Button` exposes `label`, `tone`, `variant`, `disabled`, `loading`, and accessibility state. `SyntheticBanner` always renders text, not colour alone.

- [ ] **Step 4: Run GREEN**

Run token/UI tests and type checks. Expected: pass.

### Task 4: Shared camera package

**Files:**
- Create: `mobile/packages/camera/src/CameraStage.tsx`
- Create: `mobile/packages/camera/src/capabilities.ts`
- Create: `mobile/packages/camera/src/lifecycle.ts`
- Create: `mobile/packages/camera/src/media.ts`
- Create: `mobile/packages/camera/src/types.ts`
- Create: `mobile/packages/camera/src/index.ts`
- Test: `mobile/packages/camera/src/capabilities.test.ts`
- Test: `mobile/packages/camera/src/lifecycle.test.ts`
- Test: `mobile/packages/camera/src/media.test.ts`

- [ ] **Step 1: Port Camera Lab tests and run RED**

Copy behavior tests for capability guards, AppState lifecycle, capture eligibility, and metadata normalization before copying implementation.

Run: `pnpm --dir mobile --filter @perigee/camera test`  
Expected: missing implementation failures.

- [ ] **Step 2: Implement the proven behavior**

Adapt Camera Lab without changing device negotiation or capture output. Add a compact `CaptureResult` interface for application consumers and keep diagnostics callbacks optional.

- [ ] **Step 3: Run GREEN**

Run the camera package tests. Expected: all ported behavior passes.

### Task 5: Field session and decision state machines

**Files:**
- Create: `mobile/apps/field/src/domain/session.ts`
- Create: `mobile/apps/field/src/domain/screening.ts`
- Create: `mobile/apps/field/src/domain/fixtures.ts`
- Test: `mobile/apps/field/src/domain/session.test.ts`
- Test: `mobile/apps/field/src/domain/screening.test.ts`

- [ ] **Step 1: Write failing state tests**

Cover eight-hour shift expiry, reason-code requirement, ordered capture transitions, all four fixture choices, decision latency, confirmed-rank validation, and the rule that unresolved results cannot navigate away.

```ts
expect(canLeaveResults({ status: 'PENDING_DECISION' })).toBe(false);
expect(decisionForExit('ABORTED')).toEqual({ decision: 'ABORTED' });
```

- [ ] **Step 2: Run RED**

Run: `pnpm --dir mobile --filter @perigee/field test`  
Expected: domain modules missing.

- [ ] **Step 3: Implement minimal pure reducers**

Do not place navigation objects or React state in the domain layer. Fixture metadata names the fixture and expected band without claiming recognition.

- [ ] **Step 4: Run GREEN**

Run Field domain tests. Expected: pass.

### Task 6: Field Expo app and routes

**Files:**
- Create: `mobile/apps/field/package.json`
- Create: `mobile/apps/field/app.json`
- Create: `mobile/apps/field/index.js`
- Create: `mobile/apps/field/app/_layout.tsx`
- Create: `mobile/apps/field/app/shift.tsx`
- Create: `mobile/apps/field/app/(tabs)/_layout.tsx`
- Create: `mobile/apps/field/app/(tabs)/home.tsx`
- Create: `mobile/apps/field/app/(tabs)/pending.tsx`
- Create: `mobile/apps/field/app/(tabs)/activity.tsx`
- Create: `mobile/apps/field/app/(tabs)/more.tsx`
- Create: `mobile/apps/field/app/scan/capture.tsx`
- Create: `mobile/apps/field/app/scan/review.tsx`
- Create: `mobile/apps/field/app/scan/fixture.tsx`
- Create: `mobile/apps/field/app/results/[searchId].tsx`
- Create: `mobile/apps/field/app/person/[id].tsx`
- Create: `mobile/apps/field/app/graph/[id].tsx`
- Create: `mobile/apps/field/app/settings/diagnostics.tsx`
- Create: `mobile/apps/field/app/settings/about.tsx`

- [ ] **Step 1: Add a failing route inventory test**

Assert that every required route exists and that settings contact data uses `https://github.com/SarmaHighOnCode/Perigee`.

- [ ] **Step 2: Run RED**

Run the Field tests. Expected: missing route files.

- [ ] **Step 3: Implement providers and screens**

Wire QueryClient, SafeArea, Reanimated reduced motion, session storage, API configuration, and the shared camera. Keep one primary action per screen. Use a guarded results route and explicit abort sheet.

- [ ] **Step 4: Run GREEN and type check**

Run: `pnpm --dir mobile --filter @perigee/field test && pnpm --dir mobile --filter @perigee/field typecheck`  
Expected: both commands pass.

### Task 7: Android native generation and optimization

**Files:**
- Create: `mobile/apps/field/plugins/withAndroidReleaseOptimizations.js`
- Create: generated `mobile/apps/field/android/`

- [ ] **Step 1: Add plugin behavior tests**

Port the Camera Lab config-plugin test and assert R8, resource shrinking, bundle compression, and `arm64-v8a,x86_64` splits.

- [ ] **Step 2: Run RED, implement, run GREEN**

Run Field tests before and after the plugin implementation.

- [ ] **Step 3: Generate locally and build**

Run: `pnpm --dir mobile --filter @perigee/field exec expo prebuild --platform android --clean`  
Run: `mobile\apps\field\android\gradlew.bat -p mobile\apps\field\android app:assembleRelease`  
Expected: ABI-specific release APKs containing `index.android.bundle` and no Metro requirement.

### Task 8: Field emulator smoke test

**Files:**
- Create: `mobile/docs/field-emulator-checklist.md`

- [ ] **Step 1: Start the installed Pixel 7 AVD**

Use `E:\Android\Sdk\emulator\emulator.exe -list-avds`, then start the Pixel 7 AVD if none is connected.

- [ ] **Step 2: Install the x86_64 release APK**

Use `E:\Android\Sdk\platform-tools\adb.exe install -r <apk>` and launch `com.perigee.field`.

- [ ] **Step 3: Verify the workflow**

Record startup, permission, capture, gallery, fixture, result guard, contact link, and release-without-Metro outcomes. Mark optical quality as physical-device-only.

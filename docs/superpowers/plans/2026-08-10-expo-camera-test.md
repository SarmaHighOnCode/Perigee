# Expo Camera Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and locally assemble an Android Expo SDK 54 diagnostic app that exercises CameraX-backed photo capture, gallery import/export, capability discovery, and evidence reporting.

**Architecture:** Expo Continuous Native Generation produces a local Android project, while React Native VisionCamera owns the native camera session. Pure TypeScript modules project camera capabilities, inspect normalized media records, summarize timings, and build serializable evidence reports; React hooks and one diagnostic screen adapt native APIs into those pure boundaries.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript strict mode, VisionCamera 5, Nitro Modules/Image, Expo Image Picker, Media Library, FileSystem, Device, Clipboard, Sharing, Vitest, local Android Gradle/JDK 17.

---

## File map

- `testing/testcamera/package.json` — scripts and dependency lock surface.
- `testing/testcamera/app.json` — Android permissions, package ID, New Architecture, native plugins.
- `testing/testcamera/App.tsx` — diagnostic screen composition and native orchestration.
- `testing/testcamera/src/theme.ts` — Perigee field-brutalist tokens.
- `testing/testcamera/src/types.ts` — serializable diagnostic contracts.
- `testing/testcamera/src/camera/capabilities.ts` — pure capability projection and setting guards.
- `testing/testcamera/src/diagnostics/timing.ts` — pure timing summary.
- `testing/testcamera/src/diagnostics/report.ts` — pure report creation and JSON serialization.
- `testing/testcamera/src/media/metadata.ts` — media normalization and formatting.
- `testing/testcamera/src/components/Brut.tsx` — structural UI primitive.
- `testing/testcamera/src/components/StatusChip.tsx` — accessible diagnostic status.
- `testing/testcamera/src/components/CameraStage.tsx` — VisionCamera preview and capture controls.
- `testing/testcamera/src/components/EvidencePanel.tsx` — metadata, gallery, and report actions.
- `testing/testcamera/src/**/*.test.ts` — unit tests written before pure production modules.
- `testing/testcamera/README.md` — exact local build and physical-device validation procedure.

### Task 1: Bootstrap the local Expo native project

**Files:**
- Create: `testing/testcamera/package.json`
- Create: `testing/testcamera/app.json`
- Create: `testing/testcamera/tsconfig.json`
- Create: `testing/testcamera/index.ts`
- Create: `testing/testcamera/vitest.config.ts`

- [ ] **Step 1: Generate the Expo SDK 54 TypeScript scaffold**

Run:

```powershell
npx create-expo-app@latest testing/testcamera --template blank-typescript --yes
cd testing/testcamera
npx expo install expo@~54.0.36 react-native@0.81.5
```

Expected: the project resolves to Expo SDK 54 and React Native 0.81.

- [ ] **Step 2: Install native and diagnostic dependencies**

Run:

```powershell
pnpm add react-native-vision-camera@5.2.2 react-native-nitro-modules@0.36.5 react-native-nitro-image@0.15.1
npx expo install expo-image-picker expo-media-library expo-file-system expo-device expo-clipboard expo-sharing expo-intent-launcher expo-image
pnpm add -D vitest @vitest/coverage-v8
```

Expected: `pnpm install` exits 0 with one lockfile.

- [ ] **Step 3: Configure Android and scripts**

Set `newArchEnabled: true`, package `com.perigee.testcamera`, camera and media permissions, VisionCamera plugin configuration, and scripts:

```json
{
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "android": "expo run:android",
  "prebuild": "expo prebuild --platform android",
  "build:debug": "cd android && gradlew.bat app:assembleDebug"
}
```

- [ ] **Step 4: Verify Expo configuration**

Run: `npx expo config --type public`

Expected: Android package, permissions, plugins, and New Architecture resolve without errors.

### Task 2: Capability projection with TDD

**Files:**
- Create: `testing/testcamera/src/types.ts`
- Create: `testing/testcamera/src/camera/capabilities.test.ts`
- Create: `testing/testcamera/src/camera/capabilities.ts`

- [ ] **Step 1: Write failing capability tests**

Tests must assert that a camera with flash, focus, zoom range, HDR, and low-light support exposes those controls, while a fixed-focus front camera does not. They must also assert `guardSettings()` disables unsupported HDR, low-light, and flash values.

```ts
expect(projectCapabilities(fullCamera).supportsHdr).toBe(true)
expect(guardSettings(minimalCamera, requested)).toMatchObject({ hdr: false, lowLight: false, flash: 'off' })
```

- [ ] **Step 2: Run the test and observe RED**

Run: `pnpm test -- src/camera/capabilities.test.ts`

Expected: FAIL because `capabilities.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure projection**

Define serializable `CameraDescriptor`, `CameraCapabilities`, and `CaptureSettings`. Map native device fields without retaining native objects and clamp zoom/exposure into reported ranges.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test -- src/camera/capabilities.test.ts`

Expected: all capability tests pass.

### Task 3: Timing, media metadata, and evidence reports with TDD

**Files:**
- Create: `testing/testcamera/src/diagnostics/timing.test.ts`
- Create: `testing/testcamera/src/diagnostics/timing.ts`
- Create: `testing/testcamera/src/media/metadata.test.ts`
- Create: `testing/testcamera/src/media/metadata.ts`
- Create: `testing/testcamera/src/diagnostics/report.test.ts`
- Create: `testing/testcamera/src/diagnostics/report.ts`

- [ ] **Step 1: Write failing timing tests**

```ts
expect(summarizeTimings([40, 10, 20, 30])).toEqual({ count: 4, minMs: 10, medianMs: 25, maxMs: 40 })
expect(summarizeTimings([])).toBeNull()
```

- [ ] **Step 2: Verify timing RED, implement, and verify GREEN**

Run before and after implementation: `pnpm test -- src/diagnostics/timing.test.ts`

- [ ] **Step 3: Write failing media normalization tests**

Cover `file:///` normalization, missing MIME type, byte formatting, unknown dimensions, camera versus gallery source, and acquisition timestamps.

- [ ] **Step 4: Verify metadata RED, implement, and verify GREEN**

Run before and after implementation: `pnpm test -- src/media/metadata.test.ts`

- [ ] **Step 5: Write failing evidence report tests**

Assert deterministic schema version, `PASS | FAIL | UNSUPPORTED | NOT_TESTED` checks, timing summary inclusion, absence of functions/native objects, and valid pretty-printed JSON.

- [ ] **Step 6: Verify report RED, implement, and verify GREEN**

Run before and after implementation: `pnpm test -- src/diagnostics/report.test.ts`

### Task 4: Field-brutalist UI primitives

**Files:**
- Create: `testing/testcamera/src/theme.ts`
- Create: `testing/testcamera/src/components/Brut.tsx`
- Create: `testing/testcamera/src/components/StatusChip.tsx`

- [ ] **Step 1: Define the shared token constants**

Use `ink`, `paper`, `signal`, `data`, `clear`, `alert`, and `warn` exactly as defined by Perigee, with 3 px borders and 5 px hard offset shadows.

- [ ] **Step 2: Implement focused structural components**

`Brut` accepts `tone`, `shadow`, and standard view props. `StatusChip` always renders both status text and tone so colour is never the sole channel.

- [ ] **Step 3: Type-check the primitives**

Run: `pnpm typecheck`

Expected: zero TypeScript errors.

### Task 5: Native camera stage

**Files:**
- Create: `testing/testcamera/src/components/CameraStage.tsx`

- [ ] **Step 1: Bind VisionCamera permissions and device discovery**

Use the library's camera permission hook and back/front device selection. Keep the selected native device in the component and emit only the serializable descriptor to diagnostics.

- [ ] **Step 2: Configure processed photo output and constraints**

Prioritize photo resolution, then optional HDR, with flash/zoom/exposure/focus guarded by projected capabilities. Do not enable RAW because the evaluation target is stock-camera-like processed output.

- [ ] **Step 3: Capture without recompression**

Capture to a local file, normalize to a `file:///` URI for Expo modules, measure latency with `performance.now()`, and emit metadata to the parent.

- [ ] **Step 4: Add capability-aware controls**

Add lens switching, flash cycling, zoom, exposure, tap-to-focus, HDR, and low-light controls. Disabled controls display `UNSUPPORTED` rather than silently changing settings.

- [ ] **Step 5: Handle runtime errors**

Surface native error code/message, readiness state, and session initialization latency in the evidence model.

### Task 6: Gallery, media saving, and evidence panel

**Files:**
- Create: `testing/testcamera/src/components/EvidencePanel.tsx`
- Modify: `testing/testcamera/App.tsx`

- [ ] **Step 1: Add system photo-picker import**

Use `launchImageLibraryAsync` with images-only selection and no quality reduction. Normalize cancellation as `NOT_TESTED`, not failure.

- [ ] **Step 2: Add explicit gallery save**

Request media-library permission from the action, then call `saveToLibraryAsync()` with the local capture URI. Record success or the precise failure.

- [ ] **Step 3: Add media and report sharing**

Use `expo-sharing` for the selected local photo and create a JSON report file in the cache directory for sharing. Also provide clipboard copy.

- [ ] **Step 4: Compose the single diagnostic screen**

Render readiness, camera stage, metadata, check statuses, timing summary, and actions in one scrollable screen without adding navigation.

### Task 7: Documentation and local Android build

**Files:**
- Create: `testing/testcamera/README.md`
- Create: `testing/testcamera/docs/physical-device-checklist.md`
- Generate: `testing/testcamera/android/`

- [ ] **Step 1: Document the exact local environment**

Record Node 22, pnpm 10, Java 17, `ANDROID_HOME=E:\Android\Sdk`, local prebuild/build/install commands, and the fact that iOS requires macOS/Xcode.

- [ ] **Step 2: Document the stock-camera comparison**

Include matching-scene checks for exposure, highlights, shadows, face detail, noise, colour, resolution, file size, and capture latency. Require the exported report before drawing a quality conclusion.

- [ ] **Step 3: Run the complete automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
npx expo config --type public
```

Expected: all commands exit 0.

- [ ] **Step 4: Generate Android and build locally**

Run:

```powershell
npx expo prebuild --platform android --clean
Set-Content -LiteralPath android\local.properties -Value 'sdk.dir=E:\\Android\\Sdk'
cd android
.\gradlew.bat app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 5: Verify the resulting APK and worktree**

Record APK size and SHA-256. Run `git status --short` and inspect that only the approved specification, plan, harness, lockfile, and intentionally generated native project files changed.


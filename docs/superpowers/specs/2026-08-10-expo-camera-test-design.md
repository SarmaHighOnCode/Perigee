# Expo Camera Test Harness Design

**Status:** Approved for implementation  
**Target:** Android physical devices  
**Location:** `testing/testcamera/`

## Purpose

Build a focused Expo development-build application that tests whether Perigee can obtain dependable
native Android camera capture and gallery integration without relying on EAS cloud build queues. The
harness produces evidence rather than a blanket compatibility claim: it records what automated tests
prove, what a local Android build proves, what the connected device reports, and which behaviours still
require a human comparison with the phone's stock camera.

## Chosen approach

Use Expo SDK 54 with Continuous Native Generation, a locally generated Android project, and local
Gradle builds. React Native VisionCamera supplies CameraX-backed capture and device capability
discovery. Expo packages provide gallery selection, media-library saving, file inspection, device
information, and sharing.

`expo-camera` is not the primary capture layer because the test must exercise native camera controls
and capability discovery. A pure Kotlin application is rejected because it would test CameraX but
would not establish that the Expo/React Native application architecture can host the required native
pipeline.

## Functional scope

### Readiness and permissions

- Report camera and media-library permission state.
- Request missing permissions from an explicit user action.
- Explain blocked or denied states and provide an Android settings recovery action.
- Report device manufacturer, model, Android version, and whether execution is on a physical device.

### Camera

- Discover available front and back cameras and expose switching when both exist.
- Capture a processed full-resolution still through the native photo output.
- Expose flash, zoom, tap-to-focus, and exposure adjustment where the selected device supports them.
- Expose HDR and low-light controls only when capability discovery reports support.
- Never silently substitute an unsupported setting; record the absence in the capability report.
- Measure camera initialization and capture latency.
- Keep preview/frame-processing resolution separate from still-photo resolution.

### Media inspection

- Preview the latest camera capture or gallery selection.
- Report pixel dimensions, encoded byte size, extension or MIME type, source, and acquisition time.
- Preserve the original image for quality comparison; do not apply cosmetic filters or destructive
  recompression before inspection.

### Gallery

- Import an image through the system photo picker.
- Save a captured image into the device media library after explicit permission and user action.
- Report cancellation separately from failure.
- Provide a share/export action for the selected image when supported.

### Evidence report

- Generate a JSON-compatible report containing device identity, permission states, camera inventory,
  selected camera capabilities, requested capture settings, photo metadata, and timing samples.
- Label each check as `PASS`, `FAIL`, `UNSUPPORTED`, or `NOT_TESTED`.
- Allow the report to be copied or shared.
- Never claim stock-camera parity automatically. The report includes a manual comparison checklist for
  exposure, highlight retention, shadow detail, facial detail, noise, colour, and capture latency.

## Information architecture

The application uses one screen with three functional regions:

1. **Readiness strip** — device, permissions, and build/runtime status.
2. **Camera stage** — native preview, capability-aware controls, focus interaction, and capture.
3. **Evidence drawer** — latest media metadata, gallery actions, timing, and exportable report.

This avoids navigation complexity in a diagnostic tool while keeping the camera preview primary.

## Visual language

Reuse Perigee's field-brutalist tokens:

- `ink #0A0A0A`, `paper #FFFEF0`, `signal #FFE600`, `data #00C2CB`,
  `clear #00C853`, `alert #FF3EA5`, and `warn #FF6B00`.
- Three-pixel black borders, square corners, and hard offset shadows.
- Large bottom-reachable capture and gallery controls.
- Colour is paired with text and icons, never used as the only status signal.
- The diagnostic purpose takes precedence over decorative animation.

System fonts are acceptable for this isolated test harness so that font setup cannot obscure the camera
and build evaluation. Typography remains heavy, uppercase, and data-oriented where appropriate.

## Architecture

Keep platform interaction behind small adapters:

- `camera/` owns VisionCamera selection, capability projection, and capture settings.
- `media/` owns picker, media-library save, file metadata, and sharing.
- `diagnostics/` owns status checks, timing aggregation, and report generation.
- `components/` contains focused field-brutalist UI primitives.

Pure capability and report functions have no React Native dependency and are covered by unit tests.
Native interactions remain thin and are verified through TypeScript compilation, the local Gradle build,
and the physical-device checklist.

## Error handling

- Permission denial is a recoverable state, not an exception screen.
- Camera initialization errors display their native code and remain in the report.
- Capture actions are disabled until the camera reports readiness.
- Media operations distinguish cancellation, denied access, missing files, and write failures.
- Unsupported features are hidden or disabled with an explicit reason.
- Temporary photo resources are disposed or released after use.

## Testing and proof boundaries

### Automated

- Capability projection maps device data to supported controls correctly.
- Unsupported features cannot become active capture settings.
- Metadata formatting handles missing dimensions, type, and byte size.
- Diagnostic reports classify checks and serialize without device-native objects.
- Timing summaries correctly calculate count, minimum, median, and maximum.

### Local build

- TypeScript strict checking succeeds.
- Unit tests succeed.
- Expo configuration resolves successfully.
- Expo prebuild generates the Android project.
- Gradle assembles an installable debug APK locally.

### Physical device

- Camera preview initializes.
- Full-resolution processed still capture succeeds.
- Focus, exposure, zoom, flash, HDR, and low-light behaviour are exercised where supported.
- Gallery import and media-library save succeed.
- Captured output is compared against the stock camera using the manual checklist.

A successful build without a connected phone proves native integration and compilation, not image
quality. Image-quality suitability is concluded only after the physical-device checklist and exported
report are completed.

## Deliverables

- `testing/testcamera/` Expo project with generated native configuration excluded or included according
  to the chosen Continuous Native Generation workflow.
- Unit tests and strict TypeScript configuration.
- Local build and device-test commands in the harness README.
- Exportable diagnostic report and manual stock-camera comparison checklist.
- No changes to the production architecture specifications beyond this approved design document.


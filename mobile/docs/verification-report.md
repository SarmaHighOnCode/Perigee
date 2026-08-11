# Perigee mobile verification report

Verified on 2026-08-11 against backend PR head `2f3320302b893fda1437f5c9e45d696cd16550e1` and the attached backend contract description.

## Result

Expo is suitable for these two applications because the apps use local Expo native projects and a custom development/release build, not Expo Go and not the EAS build queue. VisionCamera executes as a native Android module; Expo supplies the project/module toolchain and does not downsample the captures.

The implementation proves local native preview, camera permission, native JPEG capture, Android Photo Picker access, embedded release JavaScript, ABI-split APKs, R8 minification, resource shrinking, compressed assets, navigation, persistent drafts, and backend-contract request handling.

## Automated verification

- `pnpm check`: passed.
- Tests: 60 passed across 20 files.
  - API client: 11
  - design tokens: 3
  - shared UI: 3
  - shared camera: 9
  - Field: 13
  - Enroll: 21
- TypeScript: all six tested workspace projects passed `tsc --noEmit`.
- Expo Doctor: Field 17/17 and Enroll 17/17 passed. The one intentionally disabled check only warns that committed native folders are not automatically regenerated from `app.json`; this repo owns that synchronization through reviewed prebuild changes.
- `expo install --check`: dependencies are up to date in both apps.

During release testing, an Enroll records-screen crash was found and fixed. A Zustand selector returned a newly allocated array for every external-store snapshot, causing React's maximum-update-depth failure. Records, Drafts, and Upload Queue now select the stable draft map and derive arrays after selection; a regression test covers snapshot reference stability.

## Release artifacts

| App | ABI | Bytes | MiB | Native libraries |
| --- | --- | ---: | ---: | --- |
| Field | arm64-v8a | 14,919,044 | 14.23 | 24 arm64, 0 x86_64 |
| Field | x86_64 | 15,459,764 | 14.74 | 0 arm64, 24 x86_64 |
| Enroll | arm64-v8a | 14,940,004 | 14.25 | 24 arm64, 0 x86_64 |
| Enroll | x86_64 | 15,481,020 | 14.76 | 0 arm64, 24 x86_64 |

Every APK contains `assets/index.android.bundle`, so release launch does not depend on Metro. Both apps produced an R8 `mapping.txt` and per-ABI `resources-*-release-optimize.ap_`, confirming code minification and optimized/shrunk resources.

Manifest inspection confirms Camera, Internet, image access, and SecureStore biometric compatibility. `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are absent. Audio/video media permissions are explicitly blocked.

## Pixel emulator walkthrough

Target: local `Pixel_7_API_35`, serial `emulator-5554`, x86_64 release APKs.

### Enroll

1. Cold-launched the embedded release with no Metro server.
2. Entered operator attribution and opened Records.
3. Created a draft, entered identity, and granted Android camera permission.
4. Opened native preview and captured all three required angles.
5. Observed captured JPEGs at 1280×960, 1280×960, and 1920×1440 in the review summary.
6. Opened Android's system Photo Picker and returned to the app successfully.
7. Continued through Cases and Relationships, which clearly label unsupported backend writes as locally staged.
8. Reached Review with all three media checkpoints idle and face embedding explicitly deferred.
9. Confirmed submission is disabled until a device key is configured.

### Field

1. Cold-launched the embedded release with no Metro server.
2. Started an attributed, purpose-bound shift and reached the Field desk.
3. Granted camera permission, opened native preview, and captured a 1280×960 JPEG (about 469.5 KiB on the emulator).
4. Reached human review; the UI states no crop, editing, or app-side quality reduction was requested.
5. Continued to the synthetic connectivity-fixture selector. Search correctly remains blocked until a verified 512-D `probe-fixtures` artifact is loaded.
6. Confirmed pending-work, activity, settings, camera lab, diagnostics, and About/Contact navigation.
7. Confirmed About/Contact exposes `https://github.com/SarmaHighOnCode/Perigee`, copy URL, and report-issue actions.

No React Native or Android runtime errors were emitted during the final walkthroughs.

## Camera and gallery behavior

The shared camera package requests:

- the highest supported 4:3 photo output;
- JPEG container, quality `1`, and quality-priority capture;
- native virtual-device fusion where supported;
- native distortion correction and low-light/HDR controls only when the device reports them;
- native tap-to-focus and exposure/zoom controls when supported.

Camera media is saved directly from the native output. Gallery import uses Android's Photo Picker with editing disabled and quality `1`. Enroll stores field metadata and file URIs in AsyncStorage, never image bytes. Before upload, JPEG EXIF/comment segments and PNG metadata chunks are removed without decoding or re-encoding the image payload; SHA-256 is computed over the upload bytes.

The emulator proves integration and capture correctness, not Pixel 7 optical quality. Final optical evaluation—rear/front lenses, HDR, low-light, focus, skin tone, motion, and comparison with the stock Pixel camera—must be run on the physical Pixel 7 because an emulator supplies a virtual camera pipeline. This is a hardware validation gate, not an Expo/EAS limitation.

## Backend contract coverage

The shared typed client implements the current milestone loop:

- public config/health-facing configuration;
- `POST /v1/search`, search status, pending list, and write-once decision;
- purpose-bound person retrieval and graph retrieval;
- `POST /v1/person`;
- embedding endpoint typing, while the mobile UI intentionally does not call it yet;
- media presign, direct binary object-storage upload, and media commit.

Authenticated API calls attach the device key, officer ID, and request ID. Direct object-storage uploads intentionally omit Perigee authentication headers.

Enroll persists submission checkpoints so retries do not recreate an already-confirmed person or re-upload committed media. Ambiguous person-creation or reservation outcomes are marked `unknown` and require inspection instead of unsafe automatic retry. Storage-unavailable errors remain visible and recoverable.

The backend PR has no case-link or relationship-create endpoint and no authenticated identity/RBAC layer. The apps do not pretend these exist. Case and relationship annotations remain visibly local; operator/officer IDs are attribution, not authentication.

## Next production targets

1. Merge and deploy the backend PR, run its PostgreSQL/pgvector migrations and deterministic seed, and configure a real device key.
2. Download the CI `probe-fixtures` artifact into Field to verify live search, pending-limit, decision, person, graph, and audit-facing flows without mislabeling them as recognition.
3. Run the physical Pixel 7 camera matrix and retain original files plus dimensions, bytes, EXIF-removal hashes, and stock-camera comparisons.
4. Add backend case-link and relationship-write endpoints or remove those draft fields from the production milestone.
5. Add real authentication/RBAC and production Android signing/Play distribution.
6. Integrate on-device SCRFD/alignment/ArcFace later behind the existing 512-D normalized embedding contract; keep liveness and recognition evaluation as separate security/quality work.

Until the backend is reachable and a physical-camera matrix is signed off, the correct claim is: Expo/local native builds, camera/gallery integration, mobile workflows, and request contracts are proven; production recognition accuracy and physical Pixel image quality are not yet claimed.

# Perigee Field and Enroll — Mobile Application Design

**Date:** 2026-08-11  
**Status:** Approved by the user's instruction to proceed after the navigation proposal  
**Scope:** Two Android Expo applications, shared packages, synthetic backend integration, camera and gallery reuse

## 1. Product boundary

Perigee ships two distinct operational applications:

- **Perigee Field** supports a short, high-pressure screening loop: start a shift, capture a probe, submit a synthetic development vector, review ranked candidates, and record a mandatory human decision.
- **Perigee Enroll** supports deliberate records-desk work: create an identity record, collect front/left/right images, attach cases and evidenced relationships, review, and submit.

The applications share implementation but not navigation. A role switch inside one binary is rejected because it makes destructive and purpose-bound operations easier to confuse.

Face detection, alignment, liveness, and ArcFace remain deferred. Camera photos and gallery images are real local media. Search vectors are deterministic development fixtures and every fixture-driven surface carries a visible `SYNTHETIC SEARCH` label. A fixture result is never described as recognition.

## 2. Repository layout

The current repository keeps the mobile workspace under `mobile/` so it can be built and tested with the backend contract in one checkout while remaining extractable as the `perigee-mobile` repository described by the architecture document.

```text
mobile/
├── apps/
│   ├── field/
│   │   ├── app/
│   │   ├── app.json
│   │   └── package.json
│   └── enroll/
│       ├── app/
│       ├── app.json
│       └── package.json
├── packages/
│   ├── api-client/
│   ├── camera/
│   ├── design-tokens/
│   ├── fixtures/
│   └── ui/
├── package.json
└── pnpm-workspace.yaml
```

The validated native implementation in `testing/testcamera` is the source for `packages/camera`. It retains VisionCamera capture, CameraX device discovery, processed photo output, HDR/low-light negotiation, tap-to-focus, gallery import, media-library save, share, lifecycle handling, and diagnostic metadata.

## 3. Navigation model

Expo Router supplies file-based routes. Each app has a tab shell for destinations and a root stack for focused workflows. The tab bar disappears during capture, enrolment, results, and decision screens.

### 3.1 Perigee Field

The bottom bar has four destinations and one central action:

1. Home
2. Pending
3. **Scan** — central `signal` action, opens the capture stack
4. Activity
5. More

```text
app/
├── _layout.tsx
├── index.tsx                         startup redirect
├── shift.tsx                         officer ID and reason
├── (tabs)/
│   ├── _layout.tsx
│   ├── home.tsx
│   ├── pending.tsx
│   ├── activity.tsx
│   └── more.tsx
├── scan/
│   ├── capture.tsx
│   ├── review.tsx
│   ├── fixture.tsx
│   └── searching.tsx
├── results/[searchId].tsx
├── person/[id].tsx
├── graph/[id].tsx
└── settings/
    ├── diagnostics.tsx
    ├── camera.tsx
    ├── connection.tsx
    ├── accessibility.tsx
    └── about.tsx
```

The screening state machine is:

```text
SHIFT → CAPTURE → REVIEW → SYNTHETIC FIXTURE → SEARCH → PENDING DECISION
                                                        ├── CONFIRMED → PERSON → GRAPH
                                                        ├── NO_MATCH → RELEASE RECEIPT
                                                        ├── INCONCLUSIVE → NEW CAPTURE
                                                        └── ABORTED → AUDIT RECEIPT
```

Android Back is intercepted on an unresolved result. The exit sheet offers only `RETURN TO DECISION` or `RECORD ABORTED`. A confirmed candidate is the only path to full person data.

### 3.2 Perigee Enroll

The bottom bar has:

1. Roster
2. Drafts
3. **New** — central `signal` action
4. Activity
5. More

```text
app/
├── _layout.tsx
├── index.tsx
├── operator.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── roster.tsx
│   ├── drafts.tsx
│   ├── activity.tsx
│   └── more.tsx
├── enroll/
│   ├── identity.tsx
│   ├── capture-front.tsx
│   ├── capture-left.tsx
│   ├── capture-right.tsx
│   ├── cases.tsx
│   ├── relationships.tsx
│   ├── review.tsx
│   └── receipt.tsx
├── person/[id].tsx
└── settings/
    ├── uploads.tsx
    ├── diagnostics.tsx
    ├── connection.tsx
    └── about.tsx
```

Each step autosaves a versioned local draft. Identity submission may create the backend person before media is available, but the UI never labels enrolment complete until required captures and server operations succeed. With face processing deferred, the app uploads media when object storage exists and skips live embedding creation. Development-only fixture embeddings are permitted behind an explicit synthetic-mode control.

The current backend intentionally has no name-search or person-list endpoint. The initial Roster therefore shows local drafts, records created by this installation, and audited record-ID lookup. A server-wide roster requires a future protected, paginated backend endpoint.

## 4. Backend contract

The mobile client targets the PR #2 contract:

- `GET /healthz`
- `GET /readyz`
- `GET /v1/config`
- `POST /v1/search`
- `GET /v1/search/{search_id}`
- `GET /v1/search/pending`
- `POST /v1/search/{search_id}/decision`
- `POST /v1/person`
- `POST /v1/person/{id}/embedding`
- `POST /v1/person/{id}/media`
- direct `PUT` to the returned object-storage URL
- `POST /v1/person/{id}/media/{media_id}/commit`
- `GET /v1/person/{id}?search_id=...`
- `GET /v1/graph/{person_id}`

Authenticated development calls carry `X-Perigee-Device-Key`, `X-Perigee-Officer-Id`, and a generated `X-Request-ID`. The client parses the structured error envelope and treats `429 PENDING_DECISION_LIMIT`, `403`, `409`, `422`, `503`, timeout, and offline states as distinct recoverable UI states.

The API client is transport-injected. Tests use an in-memory fetch implementation; applications use the platform `fetch`. Device keys are never committed or placed in screen copy.

## 5. Local data and state

- Server-derived data uses TanStack Query.
- Small application/session state uses Zustand.
- Operator attribution and device key use SecureStore.
- Enrolment drafts and recent IDs use a versioned persistent store.
- Captured media remains in application storage until upload or explicit deletion.
- Search embeddings are not derived from captured media until the face package exists.

No offline search queue is included in this milestone because a queued fixture search would test transport, not the intended on-device embedding workflow. The interface does preserve incomplete decisions and enrolment drafts.

## 6. Camera and gallery

The shared camera package preserves the proven properties of Camera Lab:

- native development/release binary; never Expo Go
- back/front device selection
- maximum processed photo resolution selected from device constraints
- CameraX processing rather than raw sensor output
- flash, exposure, zoom, tap focus, HDR and low-light capability guards
- AppState-driven session shutdown and restart
- original-quality Android Photo Picker import
- MediaStore save and Android share sheet
- resolution, byte size, MIME type and latency diagnostics

Field capture accepts one reviewed image. Enroll capture stores one reviewed image for each required angle. Pose and quality scores are displayed as `NOT AVAILABLE — FACE MODULE DEFERRED`; they are never fabricated from image dimensions.

## 7. Visual system

`docs/07-DESIGN-SYSTEM.md` remains authoritative:

- `ink #0A0A0A`, `paper #FFFEF0`, `void #0B0B10`, `slab #16161F`
- `signal #FFE600`, `alert #FF3EA5`, `data #00C2CB`, `clear #00C853`, `warn #FF6B00`
- Archivo display, Public Sans body, Martian Mono data
- 3 dp borders, 5 dp hard bottom-right shadows, square surfaces
- one primary action per screen
- 64 dp primary and 56 dp secondary touch targets
- colour always paired with text and shape

Field uses more yellow and high-contrast status blocks. Enroll uses more cyan to communicate deliberate data entry while reserving yellow for the next required action.

## 8. Motion and accessibility

React Native Reanimated provides native motion. GSAP is not installed because it targets DOM/web animation. The shared motion grammar is:

- button press: translate 5 dp into its shadow, 90–120 ms
- route hierarchy: translate/opacity, 160–220 ms
- candidate reveal: 60 ms stagger, maximum 240 ms total
- decision stamp: hard 120 ms scale with no bounce
- capture: brief shutter flash tied to actual capture completion
- no idle floating, pulsing, or decorative loops

Every animation uses the system reduced-motion policy. With reduced motion enabled, route and reveal motion becomes an immediate opacity/state change while functional progress remains visible.

All interactive controls have roles, labels, state, minimum target sizes, predictable Back behavior, and adjacent error copy. Data fields are never identified by placeholder alone.

## 9. Contact and project source

Both apps expose `More → About & Contact` with:

- Open GitHub repository
- Copy repository URL
- Open GitHub issue composer
- App version, build type and commit identifier

Repository: `https://github.com/SarmaHighOnCode/Perigee`

## 10. Verification boundary

Automated verification covers navigation state, API serialization and parsing, mandatory-decision guards, draft transitions, contact URLs, synthetic labels, accessibility labels, camera capability negotiation, media metadata, type checking, linting, and release builds.

The Pixel 7 emulator proves installation, startup, navigation, permissions, gallery picker wiring, network behavior, and absence of Metro dependency in release builds. It does not prove optical quality. Camera-quality parity remains a physical-device procedure using the existing Camera Lab comparison report.

## 11. Acceptance criteria

1. Both apps install as separate Android packages and launch without Metro in release mode.
2. Field completes all four synthetic probe outcomes and records a backend decision.
3. An unresolved Field result cannot be dismissed without an explicit recorded outcome.
4. Confirmed results alone can open person data.
5. Enroll creates and resumes drafts, collects three reviewed captures, and submits supported backend operations.
6. Camera and gallery behavior is shared with Camera Lab rather than reimplemented per app.
7. Both apps expose diagnostics and the GitHub contact actions.
8. Release builds use Hermes, R8, resource shrinking, compressed native libraries, and ABI-specific APK outputs.
9. Tests, type checks and release builds pass from the local workspace.
10. Emulator evidence is reported separately from physical-device photo-quality evidence.

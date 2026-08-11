# Perigee Mobile

pnpm workspace holding the Perigee apps and their shared packages.

> **Face recognition is deliberately on hold.** `@perigee/face` ships a fixture
> engine returning deterministic synthetic vectors. They exercise the pgvector search path and the
> decision loop; **they are connectivity fixtures, not recognition results.** The real on-device
> SCRFD + ArcFace engine implements the same `FaceEngine` interface, so nothing above it changes
> when it lands.

---

## Layout

```
mobile/
├── apps/
│   └── field/              Perigee Field — the officer app
└── packages/
    ├── design-tokens/      colours, spacing, motion, bands (no react-native import)
    ├── ui/                 neobrutalist components
    ├── camera/             VisionCamera 5 wrapper, lifted from the prototype
    ├── face/               FaceEngine interface + fixture implementation
    └── api-client/         typed client for perigee-core
```

`testing/testcamera` is left **untouched**. It is the validated proof-of-concept and its
capability guards, lifecycle rules and VisionCamera 5 integration were lifted from it rather than
rewritten — those rules were each earned by a failure on real hardware.

---

## Setup

`pnpm` is pinned via `packageManager`. If it is not on your PATH, `corepack pnpm <cmd>` works.

```bash
cd mobile
corepack pnpm install
```

`.npmrc` sets `node-linker=hoisted`. That is not a preference: native Android CMake paths exceed
the Windows path limit under pnpm's default virtual-store layout, and the build fails in a way that
does not obviously point at the package manager.

### Running Field

Requires a **custom dev client**. Expo Go cannot load VisionCamera — it is a native module.

```bash
cd mobile/apps/field
corepack pnpm exec expo run:android      # builds and installs the dev client
```

Point it at a backend:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000 \
EXPO_PUBLIC_DEVICE_KEY=<from create_device_key.py> \
corepack pnpm exec expo start --dev-client
```

`10.0.2.2` is the Android emulator's alias for the host machine's `localhost`. On a physical device
use your machine's LAN IP.

Get a device key from the backend:

```bash
cd backend && python scripts/create_device_key.py --label FIELD-DEV-01 --app field
```

---

## The Field flow

```
index      shift start — officer id + reason code (NOT a login; nothing is verified)
capture    camera → on-device embed → POST /v1/search
results    ranked candidates → MANDATORY human decision
person     full record — only reachable after a CONFIRMED decision
pending    searches awaiting adjudication; blocks new searches at 3
```

Properties that are enforced, not conventional:

| Property | Where |
| --- | --- |
| The photograph never leaves the device | `capture.tsx` embeds locally and posts only the vector |
| A search cannot be abandoned silently | `results/[searchId].tsx` intercepts back and requires an explicit decision |
| `NO MATCH` is visually equal to `CONFIRM` | Both are primary 64dp buttons |
| Candidates are masked until confirmed | The API returns `masked_name`; the app has no full name to render |
| The synthetic watermark cannot be disabled | `SyntheticWatermark` has no prop for it, mounted at the root |
| `convicted` and `accused` are never summed | `person/[id].tsx` renders each case separately |

---

## Testing

```bash
corepack pnpm -r test        # all packages
corepack pnpm -r typecheck
```

Camera tests cover the capability guards and lifecycle rules as pure functions. `PerigeeCamera`
itself is not unit tested — it needs a device, and a renderer stub would prove nothing about
whether the camera works.

---

## Permissions

Field requests **camera only**. Deliberately blocked in `app.json`:

- `READ_MEDIA_IMAGES` — there is no gallery import. A probe is captured live or not at all.
- `ACCESS_FINE_LOCATION` — `geo` is optional on the API and off by default.
- audio and video — never needed.

Asking for less than you could is the cheapest privacy control available.

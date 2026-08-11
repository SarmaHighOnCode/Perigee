# Perigee mobile workspace

This workspace contains two Expo SDK 54 / React Native applications built on the validated native camera stack:

- `@perigee/field` — purpose-bound field screening, human decisions, graph/person review, pending work, diagnostics, and support.
- `@perigee/enroll` — offline-resilient identity enrolment, required front/left/right media, resumable person/media submission, and local case/relationship staging.

Face recognition is deliberately deferred. Camera images remain local in the Field fixture flow, and neither app invents an embedding, liveness result, face-quality score, or recognition decision.

## Local requirements

The verified Windows toolchain on this workstation is:

- Android SDK: `E:\Android\Sdk`
- Pixel emulator: `Pixel_7_API_35` (`emulator-5554` during verification)
- JDK 17: `C:\Program Files\Java\jdk-17`
- Project Gradle wrapper: 8.14.3
- pnpm: 10.28.0

From this directory:

```powershell
pnpm install
pnpm check
```

Run a local native development build without EAS:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = 'E:\Android\Sdk'
pnpm --filter @perigee/field android
pnpm --filter @perigee/enroll android
```

Build lean release APKs locally:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = 'E:\Android\Sdk'
pnpm --filter @perigee/field build:release
pnpm --filter @perigee/enroll build:release
```

Each release produces separate `arm64-v8a` and `x86_64` APKs under `apps/<app>/android/app/build/outputs/apk/release/`. Use arm64 for current physical Android phones and x86_64 for the local Pixel emulator.

The native Android projects are intentionally committed for deterministic local Gradle builds. When changing `app.json` or a config plugin, run the app's `prebuild` script and review the native diff before rebuilding. Expo Doctor's app-config sync warning is disabled for this deliberate non-CNG workflow; all other Doctor checks remain enabled.

## Backend setup

Both apps default to `http://10.0.2.2:8000`, Android Emulator's route to the host machine. Configure the backend device key inside each app. Requests use:

- `X-Perigee-Device-Key`
- `X-Perigee-Officer-Id`
- `X-Request-ID`

Field search requires the generated backend `probe-fixtures` JSON because recognition is on hold. Enroll can create a person, reserve media, upload bytes directly to the returned object-storage URL, and commit the media. The current backend does not expose case-link or relationship-write endpoints, so those entries remain explicitly local and pending.

See [the verification report](docs/verification-report.md) for exact results and remaining production gates.

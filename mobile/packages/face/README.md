# `@perigee/face`

The face pipeline interface, and a fixture implementation of it.

---

## ⚠ THESE ARE CONNECTIVITY FIXTURES, NOT FACE RECOGNITION RESULTS

Face recognition is **deliberately on hold**. This package currently ships
`createFixtureEngine()`, which never looks at a pixel. It returns deterministic
pseudo-random 512-float unit vectors so that everything downstream — the
pgvector search path, the candidate bands, the mandatory human decision, the
audit chain — can be built and demonstrated end to end.

A vector from this package says **nothing** about whether any face recognition
model works, and **nothing** about the person in front of the camera.

**No screen, log, report, or demo script built on this package may present its
output as recognition.** The same wording guards
`backend/scripts/seed_synthetic.py`, which generates the corpus these probes are
searched against. If a fixture vector ever ends up behind a label that reads as
an identification, that is the defect — not a presentation choice.

---

## What is real here

Two things in this package are production logic, not placeholders, and they
carry over unchanged when the real engine lands:

- **`quality.ts`** — the on-device quality gate from [docs/04 §4](../../../docs/04-FACE-PIPELINE.md).
  The scoring formula, the hard floors and the coaching messages are the real
  ones. This gate runs before the network, and a rejected capture never leaves
  the phone.
- **L2 normalisation** — `l2Normalise()` is applied to every vector this
  package emits, including caller-supplied ones. The server rejects any probe
  whose norm falls outside `[0.99, 1.01]` with `422 INVALID_EMBEDDING`, and it
  does so because an un-normalised vector does not error under cosine ranking:
  it silently returns the wrong people.

## The interface

```ts
interface FaceEngine {
  init(): Promise<InitResult>;
  embed(input: FaceInput): Promise<EmbedResult>;
  assessQuality(input: FaceInput): QualityReport;
  selfTest(): Promise<SelfTestReport>;
  readonly modelId: string;   // 'insightface/w600k_r50@1'
  readonly provider: string;  // 'fixture' here; nnapi | coreml | xnnpack | cpu later
}
```

The real on-device pipeline (SCRFD detect → 5-point align → ArcFace
`w600k_r50` → L2 normalise) lands behind exactly this interface. Callers do not
change.

`modelId` is emitted by the engine and never typed by a caller — it is the one
place the value is defined. Vectors from different models are not comparable, so
a mismatch is a `422 UNSUPPORTED_MODEL` rather than a silently wrong answer.

## Usage

```ts
import { createFixtureEngine, evaluateQuality } from '@perigee/face';

const engine = createFixtureEngine({ fixture: 'FIXTURE_STRONG' });
await engine.init();

const gate = evaluateQuality(signals, { qualityFloor: config.quality_floor });
if (!gate.passes) return showCoaching(gate.coaching);   // never reaches the network

const { embedding, modelId, quality, latencyMs } = await engine.embed({ signals });

await api.search({
  embedding: Array.from(embedding),
  model_id: modelId,
  quality: {
    score: quality.score,
    det_score: quality.detScore,
    blur: quality.blur,
    yaw: quality.yaw,
    pitch: quality.pitch,
    face_px: quality.facePx,
  },
  reason_code: 'suspicious_conduct',
});
```

### Fixture names do not guarantee a band

`FIXTURE_STRONG`, `FIXTURE_REVIEW`, `FIXTURE_AMBIGUOUS` and `FIXTURE_NO_MATCH`
select stable, distinct seeds. **The name alone does not put the probe in that
band** — only the vectors in the backend's generated
`backend/fixtures/probe_vectors.json` are measured against the seeded corpus,
and the no-match one is resampled there until it genuinely falls below the
floor. When the band matters, pass that file:

```ts
createFixtureEngine({ fixture: 'FIXTURE_STRONG', probeVectors });
```

`createFixtureEngine({ seed })` accepts any integer for an arbitrary stable
vector.

### Simulated latency

`embed()` waits `DEFAULT_LATENCY_MS` (180 ms, the mid-tier Android ArcFace time
from docs/04 §6) so that progress states, perceived responsiveness and the
`latency_ms` recorded on a decision are honest before the real engine exists.
Pass `latencyMs: 0` in tests.

### `selfTest()`

Runs the docs/04 §6 gate. For the fixture engine it verifies the fixture's own
invariants — dimension, unit norm, determinism, and that same-seed vectors
separate from different-seed ones. `provider` is reported as `fixture` and
`modelVerified` as `false`, because no model file was fetched and no SHA-256 was
checked. It is a wiring check, not evidence about recognition.

## Scripts

```
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```
